Vault is a very simple web app for storing encrypted personal login details, usernames, passwords etc. It uses the [Passpack Host-Proof Hosting package](http://code.google.com/p/passpack/) to do all encryption and decryption on the client, hence no vulnerable data is ever passed to the server. Details are stored in a SQLite database.

This application should *always* be used over an SSL-encrypted connection.