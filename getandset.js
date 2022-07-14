var WebSocketClient = require( 'websocket' ).client;
var browserifyCipher = require( 'browserify-cipher' );
var nobleSecp256k1 = require( 'noble-secp256k1' );
var crypto = require( 'crypto' );
var socket = new WebSocketClient();
var privKey = "64c2a35ea7eb34f49f23ff42f7479e00613e01c3335acaaa5adf63aea41e81fc";
var pubKeyMinus2 = nobleSecp256k1.getPublicKey( privKey, true ).substring( 2 );
function normalizeRelayURL(e){let[t,...r]=e.trim().split("?");return"http"===t.slice(0,4)&&(t="ws"+t.slice(4)),"ws"!==t.slice(0,2)&&(t="wss://"+t),t.length&&"/"===t[t.length-1]&&(t=t.slice(0,-1)),[t,...r].join("?")}
var relay = "wss://relay.damus.io";
relay = normalizeRelayURL( relay );

function sha256( string ) {
        return crypto.createHash( "sha256" ).update( string ).digest( "hex" );
}

function encrypt( privkey, pubkey, text ) {
        var key = nobleSecp256k1.getSharedSecret( privkey, '02' + pubkey, true ).substring( 2 );

        var iv = Uint8Array.from( crypto.randomBytes( 16 ) )
        var cipher = browserifyCipher.createCipheriv(
                'aes-256-cbc',
                Buffer.from( key, 'hex' ),
                iv
        );
        var encryptedMessage = cipher.update( text, "utf8", "base64" );
        emsg = encryptedMessage + cipher.final( "base64" );

        return emsg + "?iv=" + Buffer.from( iv.buffer ).toString( "base64");
}

function decrypt( privkey, pubkey, ciphertext ) {
        var [ emsg, iv ] = ciphertext.split( "?iv=" );
        var key = nobleSecp256k1.getSharedSecret( privkey, '02' + pubkey, true ).substring( 2 );

        var decipher = browserifyCipher.createDecipheriv(
                'aes-256-cbc',
                Buffer.from( key, "hex" ),
                Buffer.from( iv, "base64" )
        );
        var decryptedMessage = decipher.update( emsg, "base64" );
        dmsg = decryptedMessage + decipher.final( "utf8" );

        return dmsg;
}

var i_should_get_a_note = false;
async function getNote( id ) {
        console.log( "something called this function so I will now set i_should_get_a_note -- which is currently", i_should_get_a_note, "(it should be false) -- to true" );
        i_should_get_a_note = true;
        var note = "";
        socket.on( 'connect', async function( connection ) {
                if ( !i_should_get_a_note ) {
                        return;
                }
                console.log( "time to get a note because i_should_get_a_note is set to", i_should_get_a_note );
                var randomid = Buffer.from( nobleSecp256k1.utils.randomPrivateKey() ).toString( "hex" );
                var filter = {
                        "ids": [
                                id
                        ]
                }
                var subscription = [ "REQ", randomid, filter ];
                subscription = JSON.stringify( subscription );
                var chaser = [ "CLOSE", randomid ];
                chaser = JSON.stringify( chaser );
                connection.on( 'message', async function( event ) {
                        console.log( "yay, I got a result!" );
                        var event = JSON.parse( event.utf8Data );
                        if ( event[ 2 ] && event[ 2 ].kind == 4 && event[ 2 ].pubkey == pubKeyMinus2 ) {
                                var i; for ( i=0; i<event[ 2 ].tags.length; i++ ) {
                                        if ( event[ 2 ].tags[ i ] && event[ 2 ].tags[ i ][ 1 ] ) {
                                                var recipient = event[ 2 ].tags[ i ][ 1 ];
                                                if ( recipient == pubKeyMinus2 ) {
                                                        var decrypted_message = decrypt( privKey, event[ 2 ].pubkey, event[ 2 ].content );
                                                        console.log( "random id:", randomid );
                                                        console.log( "id I gave it:", id, "id of event it returned:", event[ 2 ].id );
                                                        console.log( "filter:", JSON.stringify( filter ) );
                                                        if ( id != event[ 2 ].id ) {
                                                                return;
                                                        } else {
                                                                note = ( decrypted_message );
                                                        }
                                                } else if ( event[ 2 ].pubkey == pubKeyMinus2 ) {
                                                        note = ( decrypt( privKey, recipient, event[ 2 ].content ) );
                                                }
                                        }
                                }
                        } else if ( event[ 2 ] && event[ 2 ].kind == 1 ) {
                                note = ( event[ 2 ].content );
                        }
                });
                console.log( "ok now I am sending the subscription -- here is what it looks like:", JSON.stringify( subscription ) );
                connection.sendUTF( subscription );
                console.log( "ok I am about to tell the relay to close my connection. Here is how my closing message looks:", JSON.stringify( chaser ) );
                setTimeout( function() {connection.sendUTF( chaser );console.log( "the closing message was sent, I think that means the relay should not send me any more results" );}, 1000 );
                setTimeout( function() {connection.close();console.log( "ok the connection should actually be severed now." );i_should_get_a_note = false;console.log( "I shouldn't get any more notes now because i_should_get_a_note is set to", i_should_get_a_note );}, 2000 );
        });
        socket.connect( relay );
        async function isNoteSetYet( note_i_seek ) {
                return new Promise( function( resolve, reject ) {
                        if ( note_i_seek == "" ) {
                                setTimeout( async function() {
                                        var msg = await isNoteSetYet( note );
                                        resolve( msg );
                                }, 100 );
                        } else {
                                resolve( note_i_seek );
                        }
                });
        }
        async function getTimeoutData() {
                var note_i_seek = await isNoteSetYet( note );
                return note_i_seek;
        }
        var returnable = await getTimeoutData();
        return returnable;
}

async function setNote( note ) {
    var id = "";
    socket.on( 'connect', function( connection ) {
        console.log( "time to set a note" );
        function makePrivateNote( note, recipientpubkey ) {
                var now = Math.floor( ( new Date().getTime() ) / 1000 );
                var privatenote = encrypt( privKey, recipientpubkey, note );
                var newevent = [
                        0,
                        pubKeyMinus2,
                        now,
                        4,
                        [['p', recipientpubkey]],
                        privatenote
                ];
                var message = JSON.stringify( newevent );
                var msghash = sha256( message );
                nobleSecp256k1.schnorr.sign( msghash, privKey ).then(
                        value => {
                                sig = value;
                                nobleSecp256k1.schnorr.verify(
                                        sig,
                                        msghash,
                                        pubKeyMinus2
                                ).then(
                                        value => {
                                                if ( value ) {
                                                        var fullevent = {
                                                                "id": msghash,
                                                                "pubkey": pubKeyMinus2,
                                                                "created_at": now,
                                                                "kind": 4,
                                                                "tags": [['p', recipientpubkey]],
                                                                "content": privatenote,
                                                                "sig": sig
                                                        }
                                                        var sendable = [ "EVENT", fullevent ];
                                                        sendable = JSON.stringify( sendable );
                                                        connection.sendUTF( sendable );
                                                        id = msghash;
                                                        setTimeout( function() {connection.close();}, 300 );
                                                 }
                                        }
                               );
                        }
                );
        }
        makePrivateNote( note, pubKeyMinus2 );
    });
    socket.connect( relay );
    async function isNoteSetYet( note_i_seek ) {
            return new Promise( function( resolve, reject ) {
                    if ( note_i_seek == "" ) {
                            setTimeout( async function() {
                                    var msg = await isNoteSetYet( id );
                                    resolve( msg );
                            }, 100 );
                    } else {
                            resolve( note_i_seek );
                    }
            });
    }
    async function getTimeoutData() {
            var note_i_seek = await isNoteSetYet( id );
            return note_i_seek;
    }
    var returnable = await getTimeoutData();
    return returnable;
}

module.exports = { sha256, getNote, setNote }
