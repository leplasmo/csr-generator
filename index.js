const path = require('path');
const express = require('express')
const forge = require('node-forge');
const yup = require('yup');
const monk = require('monk');

require('dotenv').config();

// initialize database connection and collection
const db = monk(process.env.MONGODB_URI);
const csrs = db.get('csr');

const app = express();

// serve frontend files
app.use(express.static(__dirname + '/static'))

// pull in json parser
app.use(express.json());

// create database schema
const schema = yup.object().shape({
  cn: yup.string().trim().required(),
  san: yup.string(),
  date: yup.string()
});

// routes
app.post('/csr', async function(req, res, next) {
  let { cn, san } = req.body;
  try {
    await schema.validate({
      cn,
      san,
    });
    const newCsr = {
      cn,
      san,
      date: new Date().toISOString().slice(0,10)
    };
    const created = await csrs.insert(newCsr);
  } catch (error) {
    next(error);
  }
  let csr = forge.pki.createCertificationRequest();

  let keys = await createPK();
  csr.publicKey = keys.publicKey;

  let subject = await createSubject(cn);
  // console.log(subject);
  csr.setSubject(subject);

  let attributes = await createAttributes(san);
  // console.log(attributes);
  csr.setAttributes(attributes);

  csr.sign(keys.privateKey);

  let verified = csr.verify();
  // console.log(forge.pki.certificationRequestToPem(csr));

  res.json({
    'privateKey': forge.pki.privateKeyToPem(keys.privateKey),
    'signingRequest': forge.pki.certificationRequestToPem(csr)
  });
});

const port = process.env.PORT || 1234;

app.listen(port, (err) => {
  if (err) {
    return console.log('Error: ', err);
  }
  console.log(`Server listens on port ${port}`);
});

async function createPK() {
  // create a new private key
  let keys = forge.pki.rsa.generateKeyPair(4096);
  // console.log(forge.pki.privateKeyToPem(keys.privateKey));

  return keys;
}

async function createSubject(cn) {
  let subject = [{
    name: 'commonName',
    value: cn
  }, {
    name: 'countryName',
    value: 'BE'
  }, {
    shortName: 'ST',
    value: 'Luxembourg'
  }, {
    name: 'localityName',
    value: 'Arlon'
  }, {
    name: 'organizationName',
    value: 'Province de Luxembourg'
  }, {
    shortName: 'OU',
    value: 'SPI'
  }];

  return subject;
}

async function createAttributes(san) {

      /*
      SAN Types:
      ----------
      otherName                       [0]     OtherName,
      rfc822Name                      [1]     IA5String,
      dNSName                         [2]     IA5String,
      x400Address                     [3]     ORAddress,
      directoryName                   [4]     Name,
      ediPartyName                    [5]     EDIPartyName,
      uniformResourceIdentifier       [6]     IA5String,
      iPAddress                       [7]     OCTET STRING,
      registeredID                    [8]     OBJECT IDENTIFIER
      */

      // ONLY types 2 and 7 are supported for now

  let sanList = []
  san.forEach(function (item) {
    let type = 0;
    let parts = item.split("=");
    if (parts[0] === "DNS") {
      sanList.push({
        'type': 2,
        'value': parts[1]
      });
    } else {
      sanList.push({
        'type': 7,
        'ip': parts[1] 
      });
    }
  });

  let attributes = [{
    name: 'extensionRequest',
    extensions: [{
      'name': 'subjectAltName',
      'altNames': sanList,
    }],
  }];

  return attributes;
}
