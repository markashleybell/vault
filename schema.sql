CREATE TABLE "tCredential" ("CredentialID" VARCHAR PRIMARY KEY  NOT NULL ,"Description" VARCHAR,"Url" VARCHAR,"Username" VARCHAR,"Password" VARCHAR,"Notes" VARCHAR,"UserDefined1" VARCHAR,"UserDefined1Label" VARCHAR,"UserDefined2" VARCHAR,"UserDefined2Label" VARCHAR,"UserID" VARCHAR);
CREATE TABLE "tUser" ("UserID" VARCHAR PRIMARY KEY ,"UserName" VARCHAR,"Password" VARCHAR);
