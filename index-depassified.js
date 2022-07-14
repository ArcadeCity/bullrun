const getandset = require( './getandset.js' );
const assert = require( 'assert' );
const http = require( 'http' );
const fs = require( 'fs' );
const url = require( 'url' );
const request = require( 'request' );
const bitcoinjs = require( 'bitcoinjs-lib' );
const bolt11 = require( 'bolt11' );
const {NodeVM} = require( 'vm2' );
const vm = new NodeVM({
    console: 'off',
    require: {
        external: [ 'noble-secp256k1', 'bitcoinjs-lib', 'request' ],
        root: './',
    },
    wrapper: 'none'
});

const invoicemac = "";
const adminmac = "";
const lndendpoint = "";

async function estimateExpiry( pmthash ) {
    //use the creation date of the invoice that pays me to estimate the block when that invoice was created
    //do that by getting the current unix timestamp, the current blockheight, and the invoice creation timestamp,
    var invoice_creation_timestamp = await getInvoiceCreationTimestamp( pmthash );
    invoice_creation_timestamp = Number( invoice_creation_timestamp );
    var current_unix_timestamp = Number( Math.floor( Date.now() / 1000 ) );
    var current_blockheight = await getBlockheight();
    current_blockheight = Number( current_blockheight );
    //then subtract X units of 600 seconds from the current timestamp til it is less than the invoice creation timestmap,
    var units_of_600 = 0;
    var i; for ( i=0; i<1008; i++ ) {
        var interim_unix_timestamp = current_unix_timestamp - ( ( ( units_of_600 ) + 1 ) * 600 );
        units_of_600 = units_of_600 + 1
        if ( interim_unix_timestamp < invoice_creation_timestamp ) {
            break;
        }
    }
    //then subtract X from the current blockheight to get an estimated block when my invoice was created, then add 900 to it
    //assign the result to a variable called block_when_i_consider_the_invoice_that_pays_me_to_expire
    var block_when_i_consider_the_invoice_that_pays_me_to_expire = ( current_blockheight - units_of_600 ) + 900;
/*
    //get the current blockheight and, to it, add the cltv_expiry value of the invoice I am asked to pay (should be 40 usually)
    //assign the result to a variable called block_when_i_consider_the_invoice_i_am_asked_to_pay_to_expire
    var expiry_of_invoice_that_pays_me = await getInvoiceHardExpiry( pmthash );
    var expiry_of_invoice_i_am_asked_to_pay = await get_hard_expiry_of_invoice_i_am_asked_to_pay( invoice );
    var block_when_i_consider_the_invoice_i_am_asked_to_pay_to_expire = current_blockheight + Number( expiry_of_invoice_i_am_asked_to_pay );
    //abort if block_when_i_consider_the_invoice_i_am_asked_to_pay_to_expire > block_when_i_consider_the_invoice_that_pays_me_to_expire
    if ( Number( block_when_i_consider_the_invoice_i_am_asked_to_pay_to_expire ) > Number( block_when_i_consider_the_invoice_that_pays_me_to_expire ) ) {
        return "nice try, asking me to pay you when the invoice that pays me is about to expire";
    }
    //because that would mean the recipient can hold my payment til after the invoice that pays me expires
    //then he could settle my payment to him but leave me unable to reimburse myself (because the invoice that pays me expired)
    //also, when sending my payment, remember to set the cltv_limit value
    //it should be positive and equal to block_when_i_consider_the_invoice_that_pays_me_to_expire - current_blockheight
    var cltv_limit = block_when_i_consider_the_invoice_that_pays_me_to_expire - current_blockheight;
*/
    var returnable = {}
    return block_when_i_consider_the_invoice_that_pays_me_to_expire;
}

async function getHodlInvoice( amount, hash, expiry = 40 ) {
  var invoice = "";
  const macaroon = invoicemac;
  const endpoint = lndendpoint;
  console.log( macaroon, lndendpoint );
  let requestBody = {
      hash: Buffer.from( hash, "hex" ).toString( "base64" ),
      value: amount.toString(),
      cltv_expiry: expiry.toString(),
  }
  let options = {
    url: endpoint + '/v2/invoices/hodl',
    json: true,
    headers: {
      'Grpc-Metadata-macaroon': macaroon,
    },
    form: JSON.stringify( requestBody ),
  }
  request.post( options, function( error, response, body ) {
    invoice = ( body[ "payment_request" ] );
  });
  async function isNoteSetYet( note_i_seek ) {
          return new Promise( function( resolve, reject ) {
                  if ( note_i_seek == "" ) {
                          setTimeout( async function() {
                                  var msg = await isNoteSetYet( invoice );
                                  resolve( msg );
                          }, 100 );
                  } else {
                          resolve( note_i_seek );
                  }
          });
    }
    async function getTimeoutData() {
            var invoice_i_seek = await isNoteSetYet( invoice );
            return invoice_i_seek;
    }
    var returnable = await getTimeoutData();
    return returnable;
}

async function settleHoldInvoice( preimage ) {
  var settled = "";
  const macaroon = invoicemac;
  const endpoint = lndendpoint;
  let requestBody = {
      preimage: Buffer.from( preimage, "hex" ).toString( "base64" )
  }
  let options = {
    url: endpoint + '/v2/invoices/settle',
    json: true,
    headers: {
      'Grpc-Metadata-macaroon': macaroon,
    },
    form: JSON.stringify( requestBody ),
  }
  request.post( options, function( error, response, body ) {
    if ( body.toString().includes( "{" ) ) {
        settled = "true";
    } else {
        settled = "false";
    }
  });
  async function isNoteSetYet( note_i_seek ) {
          return new Promise( function( resolve, reject ) {
                  if ( note_i_seek == "" ) {
                          setTimeout( async function() {
                                  var msg = await isNoteSetYet( settled );
                                  resolve( msg );
                          }, 100 );
                  } else {
                          resolve( note_i_seek );
                  }
          });
    }
    async function getTimeoutData() {
            var invoice_i_seek = await isNoteSetYet( settled );
            return invoice_i_seek;
    }
    var returnable = await getTimeoutData();
    return returnable;   
}

async function payInvoiceAndSettleWithPreimage( invoice ) {
    var preimage = "";
    var users_pmthash = getinvoicepmthash( invoice );
    var state_of_held_invoice_with_that_hash = await checkInvoiceStatus( users_pmthash );
    if ( state_of_held_invoice_with_that_hash != "ACCEPTED" ) {
        return "nice try, asking me to pay an invoice without compensation: " + state_of_held_invoice_with_that_hash;
    }
    var amount_i_will_receive = await getInvoiceAmount( users_pmthash );
    var amount_i_am_asked_to_pay = get_amount_i_am_asked_to_pay( invoice );
    if ( Number( amount_i_will_receive ) < Number( amount_i_am_asked_to_pay ) ) {
        return "nice try, asking me to send more than I will receive as compensation";
    }
    //use the creation date of the invoice that pays me to estimate the block when that invoice was created
    //do that by getting the current unix timestamp, the current blockheight, and the invoice creation timestamp,
    var invoice_creation_timestamp = await getInvoiceCreationTimestamp( users_pmthash );
    invoice_creation_timestamp = Number( invoice_creation_timestamp );
    var current_unix_timestamp = Number( Math.floor( Date.now() / 1000 ) );
    var current_blockheight = await getBlockheight();
    current_blockheight = Number( current_blockheight );
    //then subtract X units of 600 seconds from the current timestamp til it is less than the invoice creation timestmap,
    var units_of_600 = 0;
    var i; for ( i=0; i<1008; i++ ) {
        var interim_unix_timestamp = current_unix_timestamp - ( ( ( units_of_600 ) + 1 ) * 600 );
        units_of_600 = units_of_600 + 1
        if ( interim_unix_timestamp < invoice_creation_timestamp ) {
            break;
        }
    }
    //then subtract X from the current blockheight to get an estimated block when my invoice was created, then add 900 to it
    //assign the result to a variable called block_when_i_consider_the_invoice_that_pays_me_to_expire
    var block_when_i_consider_the_invoice_that_pays_me_to_expire = ( current_blockheight - units_of_600 ) + 900;
    //get the current blockheight and, to it, add the cltv_expiry value of the invoice I am asked to pay (should be 40 usually)
    //assign the result to a variable called block_when_i_consider_the_invoice_i_am_asked_to_pay_to_expire
    var expiry_of_invoice_that_pays_me = await getInvoiceHardExpiry( users_pmthash );
    var expiry_of_invoice_i_am_asked_to_pay = await get_hard_expiry_of_invoice_i_am_asked_to_pay( invoice );
    var block_when_i_consider_the_invoice_i_am_asked_to_pay_to_expire = current_blockheight + Number( expiry_of_invoice_i_am_asked_to_pay );
    //abort if block_when_i_consider_the_invoice_i_am_asked_to_pay_to_expire > block_when_i_consider_the_invoice_that_pays_me_to_expire
    if ( Number( block_when_i_consider_the_invoice_i_am_asked_to_pay_to_expire ) > Number( block_when_i_consider_the_invoice_that_pays_me_to_expire ) ) {
        return "nice try, asking me to pay you when the invoice that pays me is about to expire";
    }
    //because that would mean the recipient can hold my payment til after the invoice that pays me expires
    //then he could settle my payment to him but leave me unable to reimburse myself (because the invoice that pays me expired)
    //also, when sending my payment, remember to set the cltv_limit value
    //it should be positive and equal to block_when_i_consider_the_invoice_that_pays_me_to_expire - current_blockheight
    var cltv_limit = block_when_i_consider_the_invoice_that_pays_me_to_expire - current_blockheight;
    var adminmacaroon = adminmac;
    var endpoint = lndendpoint;
    let requestBody = {
        payment_request: invoice,
        fee_limit: {"fixed": "500"},
        allow_self_payment: true,
        cltv_limit: Number( cltv_limit )
    }
    let options = {
        url: endpoint + '/v1/channels/transactions',
        json: true,
        headers: {
          'Grpc-Metadata-macaroon': adminmacaroon,
        },
        form: JSON.stringify( requestBody ),
    }
    request.post( options, function( error, response, body ) {
        preimage = ( body[ "payment_preimage" ] );
    });
    async function isDataSetYet( data_i_seek ) {
        return new Promise( function( resolve, reject ) {
            if ( data_i_seek == "" ) {
                setTimeout( async function() {
                    var msg = await isDataSetYet( preimage );
                    resolve( msg );
                }, 100 );
            } else {
                resolve( data_i_seek );
            }
        });
    }
    async function getTimeoutData() {
        var data_i_seek = await isDataSetYet( preimage );
        return data_i_seek;
    }
    var preimage_for_settling_invoice_that_pays_me = await getTimeoutData();
        if ( preimage_for_settling_invoice_that_pays_me != "" ) {
            preimage_for_settling_invoice_that_pays_me = Buffer.from( preimage_for_settling_invoice_that_pays_me, "base64" ).toString( "hex" );
            console.log( preimage_for_settling_invoice_that_pays_me );
            settleHoldInvoice( preimage_for_settling_invoice_that_pays_me );
            returnable = '{"status": "success","preimage":"' + preimage_for_settling_invoice_that_pays_me + '"}';
        } else {
            returnable = '{"status": "failure"}';
        }
    return returnable;
}

function get_amount_i_am_asked_to_pay( invoice ) {
    var decoded = bolt11.decode( invoice );
    var amount = decoded[ "satoshis" ].toString();
    return amount;
}

async function getInvoiceAmount( hash ) {
  var amount = "";
  const macaroon = invoicemac;
  const endpoint = lndendpoint;
  let options = {
    url: endpoint + '/v1/invoice/' + hash,
    json: true,
    headers: {
      'Grpc-Metadata-macaroon': macaroon,
    },
  }
  request.get( options, function( error, response, body ) {
    amount = body[ "value" ];
  });
  async function isDataSetYet( data_i_seek ) {
          return new Promise( function( resolve, reject ) {
                  if ( data_i_seek == "" ) {
                          setTimeout( async function() {
                                  var msg = await isDataSetYet( amount );
                                  resolve( msg );
                          }, 100 );
                  } else {
                          resolve( data_i_seek );
                  }
          });
    }
    async function getTimeoutData() {
            var data_i_seek = await isDataSetYet( amount );
            return data_i_seek;
    }
    var returnable = await getTimeoutData();
    return returnable;
}

async function checkInvoiceStatus( hash ) {
  var status = "";
  const macaroon = invoicemac;
  const endpoint = lndendpoint;
  let options = {
    url: endpoint + '/v1/invoice/' + hash,
    json: true,
    headers: {
      'Grpc-Metadata-macaroon': macaroon,
    },
  }
  request.get( options, function( error, response, body ) {
    status = body[ "state" ];
  });
  async function isDataSetYet( data_i_seek ) {
          return new Promise( function( resolve, reject ) {
                  if ( data_i_seek == "" ) {
                          setTimeout( async function() {
                                  var msg = await isDataSetYet( status );
                                  resolve( msg );
                          }, 100 );
                  } else {
                          resolve( data_i_seek );
                  }
          });
    }
    async function getTimeoutData() {
            var data_i_seek = await isDataSetYet( status );
            return data_i_seek;
    }
    var returnable = await getTimeoutData();
    return returnable;
}

async function getInvoiceCreationTimestamp( hash ) {
  var timestamp = "";
  const macaroon = invoicemac;
  const endpoint = lndendpoint;
  let options = {
    url: endpoint + '/v1/invoice/' + hash,
    json: true,
    headers: {
      'Grpc-Metadata-macaroon': macaroon,
    },
  }
  request.get( options, function( error, response, body ) {
    timestamp = body[ "creation_date" ];
  });
  async function isDataSetYet( data_i_seek ) {
          return new Promise( function( resolve, reject ) {
                  if ( data_i_seek == "" ) {
                          setTimeout( async function() {
                                  var msg = await isDataSetYet( timestamp );
                                  resolve( msg );
                          }, 100 );
                  } else {
                          resolve( data_i_seek );
                  }
          });
    }
    async function getTimeoutData() {
            var data_i_seek = await isDataSetYet( timestamp );
            return data_i_seek;
    }
    var returnable = await getTimeoutData();
    return returnable;
}

async function getInvoiceHardExpiry( hash ) {
  var expiry = "";
  const macaroon = invoicemac;
  const endpoint = lndendpoint;
  let options = {
    url: endpoint + '/v1/invoice/' + hash,
    json: true,
    headers: {
      'Grpc-Metadata-macaroon': macaroon,
    },
  }
  request.get( options, function( error, response, body ) {
    expiry = body[ "cltv_expiry" ];
  });
  async function isDataSetYet( data_i_seek ) {
          return new Promise( function( resolve, reject ) {
                  if ( data_i_seek == "" ) {
                          setTimeout( async function() {
                                  var msg = await isDataSetYet( expiry );
                                  resolve( msg );
                          }, 100 );
                  } else {
                          resolve( data_i_seek );
                  }
          });
    }
    async function getTimeoutData() {
            var data_i_seek = await isDataSetYet( expiry );
            return data_i_seek;
    }
    var returnable = await getTimeoutData();
    return returnable;
}

async function getBlockheight() {
    return new Promise( function( resolve, reject ) {
        request( "https://blockstream.info/api/blocks/tip/height", function( error, response, body ) {
            if ( !error && response.statusCode >= 200 && response.statusCode < 300 ) {
                resolve( body );
            }
        });
    });
}

async function get_hard_expiry_of_invoice_i_am_asked_to_pay( invoice ) {
    var decoded = bolt11.decode( invoice );
    var i; for ( i=0; i<decoded[ "tags" ].length; i++ ) {
        if ( decoded[ "tags" ][ i ][ "tagName" ] == "min_final_cltv_expiry" ) {
            var cltv_expiry = decoded[ "tags" ][ i ][ "data" ].toString();
        }
    }
    return cltv_expiry;
}

function getinvoicepmthash( invoice ) {
    var decoded = bolt11.decode( invoice );
    var i; for ( i=0; i<decoded[ "tags" ].length; i++ ) {
        if ( decoded[ "tags" ][ i ][ "tagName" ] == "payment_hash" ) {
            var pmthash = decoded[ "tags" ][ i ][ "data" ].toString();
        }
    }
    return pmthash;
}

function isHex( h ) {
        var length = h.length;
        var a = BigInt( "0x" + h, "hex" );
        var unpadded = a.toString( 16 );
        var padding = "000000000000000000000000000000000000000000000000000000000000000000";
        padding = padding + unpadded.toString();
        padding = padding.slice( -Math.abs( length ) );
        return ( padding === h );
}

async function getNote( id ) {
        var note = await getandset.getNote( id );
        //console.log( "id", id, "note", note );
        return note;
}

async function setNote( text_to_store ) {
        var id = await getandset.setNote( text_to_store );
        return id;
}

var sendResponse = ( response, data, statusCode ) => {
  response.setHeader( 'Access-Control-Allow-Origin', '*' );
  response.setHeader( 'Access-Control-Request-Method', '*' );
  response.setHeader( 'Access-Control-Allow-Methods', 'OPTIONS, GET' );
  response.setHeader( 'Access-Control-Allow-Headers', '*' );
  response.writeHead( statusCode );
  response.end( data );
};

var collectData = ( request, callback ) => {
  var data = '';
  request.on( 'data', ( chunk ) => {
    data += chunk;
  });
  request.on( 'end', () => {
    callback( data );
  });
};

const requestListener = async function( request, response ) {
  var parts = url.parse( request.url, true );
  var gets = parts.query;
  var path = parts.pathname;
  if ( path === '/settle-after-proof' || path === '/settle-after-proof/' ) {
    if ( request.method === 'GET' ) {
      if ( !gets.script || !gets.voucherid || !gets.invoice ) {
          sendResponse( response, 'nice try!', 200, {'Content-Type': 'text/plain'} );
      }
      var voucherid = gets.voucherid;
      var invoice_i_am_asked_to_pay = gets.invoice;
      var voucher = await getNote( voucherid );
      var voucher = JSON.parse( voucher );
      var scripthash = voucher[ "scripthash" ];
      var pmthash = voucher[ "pmthash" ];
      var querykey = voucher[ "querykey" ];
      var script = Buffer.from( gets.script, "hex" ).toString();
      var params = Buffer.from( gets.params, "hex" ).toString();
      if ( getandset.sha256( script ) != scripthash || ( !isHex( scripthash ) || scripthash.length != 64 ) ) {
        sendResponse( response, "false", 200, {'Content-Type': 'text/plain'} );
      } else {
        var i_should_pay_the_invoice = await assessOwnership( script, params );
        if ( i_should_pay_the_invoice == "true" ) {
          var returnable = await payInvoiceAndSettleWithPreimage( invoice_i_am_asked_to_pay );
          sendResponse( response, returnable, 200, {'Content-Type': 'text/plain'} );
        }
      }
    } else if ( request.method === 'POST' ) {
      collectData(request, ( formattedData ) => {
        // do something with the formatted data e.g. store in db
        sendResponse( response, 'Post data: ' + formattedData, 200, {'Content-Type': 'text/plain'} );
      });
    }
  }
  if ( path === '/verify-ownership' || path === '/verify-ownership/' ) {
    if ( request.method === 'GET' ) {
      if ( !gets.script || !gets.voucherid ) {
          sendResponse( response, 'nice try!', 200, {'Content-Type': 'text/plain'} );
      }
      var voucherid = gets.voucherid;
      var voucher = await getNote( voucherid );
      var voucher = JSON.parse( voucher );
      var scripthash = voucher[ "scripthash" ];
      var pmthash = voucher[ "pmthash" ];
      var querykey = voucher[ "querykey" ];
      var script = Buffer.from( gets.script, "hex" ).toString();
      var params = Buffer.from( gets.params, "hex" ).toString();
      if ( getandset.sha256( script ) != scripthash || ( !isHex( scripthash ) || scripthash.length != 64 ) ) {
        sendResponse( response, "false", 200, {'Content-Type': 'text/plain'} );
      } else {
        sendResponse( response, await assessOwnership( script, params ), 200, {'Content-Type': 'text/plain'} );
      }
    } else if ( request.method === 'POST' ) {
      collectData(request, ( formattedData ) => {
        // do something with the formatted data e.g. store in db
        sendResponse( response, 'Post data: ' + formattedData, 200, {'Content-Type': 'text/plain'} );
      });
    }
  }
  if ( path === '/gethodlinvoice' || path === '/gethodlinvoice/' ) {
    if ( request.method === 'GET' ) {
      //console.log( "scripthash:", gets.scripthash );
      if ( ( !isHex( gets.scripthash ) || gets.scripthash.length != 64 ) || ( !isHex( gets.pmthash ) || gets.pmthash.length != 64 ) || ( !isHex( gets.querykey ) || gets.querykey.length != 66 ) ) {
              sendResponse( response, 'nice try!', 200, {'Content-Type': 'text/plain'} );
              return;
      }
      var json = {}
      json[ "pmthash" ] = gets.pmthash;
      json[ "scripthash" ] = gets.scripthash;
      json[ "amount" ] = gets.amount;
      json[ "querykey" ] = gets.querykey;
      //console.log( "scripthash:", json[ "scripthash" ] );
      var voucher = JSON.stringify( json );
      var invoice = await getHodlInvoice( json[ "amount" ], json[ "pmthash" ], 1008 );
      var voucher_id = await setNote( voucher );
      json[ "invoice" ] = invoice;
      json[ "voucher_id" ] = voucher_id;
      var returnable = JSON.stringify( json );
      sendResponse( response, returnable, 200, {'Content-Type': 'text/plain'} );
    }
  }
  if ( path === '/queryforvoucher' || path === '/queryforvoucher/' ) {
    if ( request.method === 'GET' ) {
      var voucherid = gets.voucherid;
      var voucher = await getNote( voucherid );
      var json = JSON.parse( voucher );
      var pmthash = json[ "pmthash" ];
      json[ "expiry" ] = await estimateExpiry( pmthash );
      json[ "status" ] = await checkInvoiceStatus( pmthash );
      voucher = JSON.stringify( json );
      sendResponse( response, voucher, 200, {'Content-Type': 'text/plain'} );
    }
  }
};

const server = http.createServer( requestListener );
server.listen( 8080 );

function runScript( script, params ) {
    var filled_in_script = `
            var request = require( 'request' );
            var nobleSecp256k1 = require( 'noble-secp256k1' );
            var bitcoinjs = require( 'bitcoinjs-lib' );
            var challenge = Buffer.from( nobleSecp256k1.utils.randomPrivateKey() ).toString( "hex" );
            ` + script + `
            var true_or_false = script( ` + params + ` );
            return true_or_false;
    `;
    try {
        assert.ok( vm.run( filled_in_script, 'vm.js' ) === true );
        return "true";
    } catch ( error ) {
        return "false";
    }
    //request('http://www.google.com', function (error, response, body) {
    //    console.error(error);
    //    if (!error && response.statusCode >= 200 && response.statusCode < 300) {
    //        console.log(body); // Show the HTML for the Google homepage.
    //    }
    //});
}

async function assessOwnership( script, params ) {
  //A promise race prevents an infinitely looping script from making the function take forever to return a value
  //Note that scripts will still run even after 15000 milliseconds pass, but the user won't see what they return,
  //if anything
  const userScript = () => new Promise(resolve =>
    setTimeout(() => resolve(
      runScript( script, params )
    ),0))

  const timeout = (cb, interval) => () =>
   new Promise(resolve => setTimeout(() => cb(resolve), interval))

  const timeLimit = timeout(resolve =>
    resolve( "The user's function ran too long" ), 15000)

  return Promise.race([userScript, timeLimit].map(f => f()))
}
