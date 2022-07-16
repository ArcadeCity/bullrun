# Bullrun
Ridesharing software powered by bitcoin payments and the lightning network

# How to try it

It's not public yet because of some serious bugs and incomplete parts, but lots of it works. To try it you'll have to expose LND on a port somewhere, download some files from this github, modify index.js to point to your exposed LND endpoint, run index.js using nodejs, modify rider.html and driver.html to change all instances of http://localhost:8080 to some endpoint that exposes index.js, modify driver.html to add an invoice macaroon to part of it, and then open both rider.html and driver.html in separate tabs.

# What works and what doesn't?

If you do all of the stuff mentioned above, here's what will work: rider.html should show a map with your current location represented as a pin. You can drop a second pin wherever you want to go and it will ask you how many sats you want to pay for someone to drive you there. It will also ask you for a fake name for your driver to identify you by. Driver.html should show a few irrelevant boxes that you can ignore, I'll delete them eventually, they are vestiges of another project that I used in the initial phase of making this one. When someone broadcasts that they want a ride (this happens on nostr), driver.html should show you a popup with some of the rider's details, like how far away they are, how far their trip is, and how much money you'll get for taking them there.

If you click that you want to be their driver, a popup should show up on rider.html asking you if you want to accept that driver and giving you basic details about him like how far away he is and what type of vehicle he has. (Right now, driver information is hard coded and thus inaccurate.) If you accept the driver you'll be asked to pay a lightning invoice which gets escrowed by whoever is running the backend. If you pay it, it will tell you you can watch your driver approach you on a map, but that doesn't actually work yet because driver.html does not currently have gps support and it also doesn't broadcast his current location (those are upcoming features). What does happen is that driver.html will get a copy of a lightning voucher you created when you paid the lightning invoice. He can't redeem it without a preimage, though, which is shown on rider.html.

At this point rider.html will continue tracking the rider's location until the device is within 100 feet of its destination. At that point it will send the preimage to the driver who will automatically use it to redeem the voucher that is escrowed by whoever is running the backend. The preimage is also displayed as a qr code on rider.html and my hope is to eventually make a feature where driver.html can scan it and redeem the voucher that way. This should be useful in situations where the rider got close enough to their destination to satisfy them, but technically not precisely within 100 feet of where they dropped the pin.

# More broken things

There is a file called getandset.js which is used by the backend to store information on nostr and retrieve it. But it works very imperfectly due to a bug I am having trouble understanding. Basically it works great the first time you use it, but the second time it works a little less well, namely, it fires off multiple queries to nostr and not all of them appear to return accurate information. Every subsequent time you use it, it will fire off more and more bad queries to nostr, getting up to hundreds of queries after four or five uses, at which point it will consume too much of nodejs's memory limits and crash. I don't know why it does this but I think I am using websockets incorrectly.

# Dependencies

If you try to install the backend you'll need some dependencies:

`npm install bitcoinjs-lib bolt11 vm2 ws browserify-cipher noble-secp256k1`
