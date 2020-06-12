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

  // clean up and validate raw request data
  const csrParams = await validateRequestData(req.body);
  console.log(`csrParams: ${csrParams}`);

  // generate csr
  let { keys, csr } = await createCsr(csrParams);
  console.log(`keys: ${keys}`);
  console.log(`csr: ${csr}`);

  // save to database
  let dbRecord = await saveToDatabase(csrParams);
  console.log(`dbRecord: ${dbRecord}`);

  res.json({
    'privateKey': forge.pki.privateKeyToPem(keys.privateKey),
    'signingRequest': forge.pki.certificationRequestToPem(csr)
  });
});

function jsonEscape(str)  {
  return str.replace(/\n/g, "\\\\n").replace(/\r/g, "\\\\r").replace(/\t/g, "\\\\t");
}

const port = process.env.PORT || 1234;

app.listen(port, (err) => {
  if (err) {
    return console.log('Error: ', err);
  }
  console.log(`Server listens on port ${port}`);
});

async function saveToDatabase(csrParams) {

  try {
    await schema.validate({
      cn: csrParams.cn,
      san: csrParams.san,
    });
    const newCsr = {
      cn: csrParams.cn,
      san: csrParams.san,
      date: new Date().toISOString().slice(0,10)
    };
    const created = await csrs.insert(newCsr);
  } catch (error) {
    console.log("Error: Could not save to the database.")
    next(error);
  }

  return "ok";
}

async function createCsr(csrParams) {
  let csr = forge.pki.createCertificationRequest();

  let keys = await createPK();
  csr.publicKey = keys.publicKey;

  let subject = await createSubject(csrParams.cn);
  // console.log(subject);
  csr.setSubject(subject);

  let attributes = await createAttributes(csrParams.san);
  // console.log(attributes);
  csr.setAttributes(attributes);

  csr.sign(keys.privateKey);

  let verified = csr.verify();
  // console.log(forge.pki.certificationRequestToPem(csr));

  return {keys, csr};
}

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

function ValidateFQDN(fqdn) {
  let re = /^(?!:\/\/)([a-zA-Z0-9-]+\.){0,5}[a-zA-Z0-9-][a-zA-Z0-9-]+\.[a-zA-Z]{2,64}?$/gi;
  if (re.test(fqdn)) {
    return true;
  }
  return false;
}

function ValidateIPaddress(ipaddress) {
  let re = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (re.test(ipaddress)) {
    return true;
  }
  return false;
}

function parseSubjAltNames(san) {
  let result = [];
  san.forEach(function(sanItem) {
    // convert to lowecase
    sanItem = sanItem.toLowerCase();
    let isFQDN = ValidateFQDN(sanItem);
    let isIP = ValidateIPaddress(sanItem);

    // only one of both should be true
    if (isFQDN === isIP) {
      // they are either both true or both false
      console.log(`ERROR: Data validation error for: ${sanItem}`);
    } else {
      // data is valid
      if (isFQDN === true) {
        result.push(`DNS=${sanItem}`);
      } else {
        result.push(`IP=${sanItem}`);
      }
    }
  });
  // return the array
  return result;
}

async function validateRequestData(request) {
  // console.log(request)
  // check that user provided a valid common-name
  const validated = {};
  let cnRaw = (request.cn || '').toLowerCase();
  let sanRaw = (request.san || '').toLowerCase();
  let san = [];

  // if provided common-name is not valid throw error
  if (cnRaw === '' || ValidateFQDN(cnRaw === false)) {
    console.log("Error: The common-name is not a valid FQDN");
    return;
  }

  // if subject-alternative-names were provided
  if (sanRaw !== null && sanRaw !== '') {
    // clean up the raw SAN string 
    sanRaw = sanRaw.replace(/\n+/g,";");
    sanRaw = sanRaw.replace(/\t+/g,";");
    sanRaw = sanRaw.replace(/\,+/g,";");
    sanRaw = sanRaw.replace(/\s+/g,";");
    sanRaw = sanRaw.replace(/\;+/g,";"); // if multiple ;
    san = sanRaw.split(";");

    // remove empty elements
    san = san.filter(sanItem => sanItem !== "");
  }

  // make sure that common-name is in the list
  if (san.indexOf(cnRaw) < 0) {
    san.push(cnRaw)
  }

  validated.cn = cnRaw;
  // parse subject alternative name types
  validated.san = parseSubjAltNames(san);

  // console.log(validated);
  return validated;
}