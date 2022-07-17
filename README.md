# Bullrun
Ridesharing software powered by bitcoin payments and the lightning network

# How to try it

Open these two pages in two different browser tabs:

https://supertestnet.github.io/bullrun/rider.html

and

https://supertestnet.github.io/bullrun/driver.html

Be aware that not everything works. Don't expect much. Start by picking a spot on the map in rider.html where you want to pay someone to take you. Confirm your choice and a set of popups should ask you how much you want to pay for this ride and what name to use. Fill that out and then go to driver.html. It should ask you basic information about your name and vehicle info. Then a set of one or more popups should show you all the ride requests that came in during the last 5 minutes. (Eventually this will be geographically limited so you don't see requests from the other side of the country, but that's not implemented yet. It also currently shows you ride requests from people who already accepted a driver; maybe someday I'll fix that too.) You'll also see a box that asks you to enter your lnd endpoint and macaroon. Do that (the endpoint must not have a trailing slash at the end and it must be http or https) and hit submit.

If you accept the ride request you broadcasted in rider.html, go back to rider.html. A popup should give you basic information about the driver who said they'd pick you up and ask if you want to accept this driver. If you accept them, you should see a lightning invoice below the map that asks you to pay it. Pay it and a popup should tell you not to show your driver his preimage til your ride is done. It also says you can track your driver on the map, which should update every 10 seconds with the location of your driver. Your app is now tracking your location and checking every few seconds to see if you are within 100 feet of your destination. If you are, it should automatically send your preimage to driver.html, which should automatically use it collect the money and deposit it into your node. Eventually I want driver.html to optionally scan the preimage from the user's phone in case they get the user where they want to go but it's technically not within 100 feet of the pin they placed on the map. But that isn't implemented yet so hang tight.

Anyway this currently works for getting a ride to and from a destination for bitcoin. It will (hopefully) get better, but the amazing thing is it works right now! Go ahead and try it! (Only with someone you trust -- see the Disputes section below.)

# How to run the backend

Expose LND on a port somewhere, create a nodejs directory for bullrun, install these dependencies: `npm install bitcoinjs-lib bolt11 vm2 ws browserify-cipher noble-secp256k1 request`, download the files from this github and put them into your bullrun directory, modify index.js to point to your exposed LND endpoint and put in your macaroons, run index.js using nodejs, expose it on some endpoint, modify rider.html and driver.html to change all instances of https://app9.lightningescrow.io to whatever endpoint you're exposing index.js on, and then open both rider.html and driver.html in separate tabs.

# Disputes

Oh yeah, disputes don't work yet. I haven't implemented a way to connect payments to ride ids. So if your rider doesn't voluntarily give you your money, I've got no way to know which payment (if any) you're supposed to get, and your rider can just withhold it from you til the lightning invoice expires. So it's very easy for riders to get free rides right now. Payments *are* escrowed by Lightning Escrow (or whoever's running the backend) right now, and due to my neglience in coding, the part where the driver gets their payment technically gives Lightning Escrow custody of your money for a brief period. I'll work on fixing this as well as making a way to provably associate payments with ride ids. If I finish that, then disputes between riders and drivers will have a way to work them out: submit proof to Lightning Escrow (or whoever's running the backend) that you held up your end of the bargain (with e.g. dashcam footage or an audio recording of the ride) and Lightning Escrow can then finalize the payment on the side of whoever they think was the victim. But right now if there's a dispute no one can really do anything about it, so the driver will just never receive the disputed payment. Therefore do not use this with people you don't trust yet!
