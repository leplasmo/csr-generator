const uiCNInput = document.getElementById('common-name');
const uiSANInput = document.getElementById('subj-alt-names');
const uiGenerateCSRButton = document.getElementById('generate-csr');
const uiResultPK = document.getElementById('result-pk');
const uiResultCSR = document.getElementById('result-csr');
const uiResultContainer = document.getElementById('result');
const uiProgress = document.getElementById('progress');
const uiPerformance = document.getElementById('performance');

uiResultContainer.style.display = "none";
uiPerformance.style.display = "none";
uiProgress.style.display = "none";
loadEventListeners();

function loadEventListeners() {
  
  uiGenerateCSRButton.addEventListener('click', generateCSR);
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



function parseSubjAltNames(subjAltNames) {

  let result = [];
  subjAltNames.forEach(function(subjAltName) {

    // convert to lowecase
    subjAltName = subjAltName.toLowerCase();
    let isFQDN = ValidateFQDN(subjAltName);
    let isIP = ValidateIPaddress(subjAltName);

    // only one of both should be true
    if (isFQDN === isIP) {
      // they are either both true or both false
      console.log(`ERROR: Data validation error for: ${subjAltName}`);
    } else {
      // data is valid
      if (isFQDN === true) {
        result.push(`DNS=${subjAltName}`);
      } else {
        result.push(`IP=${subjAltName}`);
      }
    }
  });

  // return the array
  return result;

}

async function generateCSR(e) {

  let t0 = performance.now();

  // check that user provided a valid common-name
  const commonName = uiCNInput.value;
  const csrParam = {};
  if (ValidateFQDN(commonName.toLowerCase())) {
    csrParam.cn = commonName;
  } else {
    alert("Error: You must, at least, provide a valid common-name.");
    console.log("Error: The common-name is not a valid FQDN")

    return;
  }

  // show the progress bar
  uiProgress.style.display = "block";

  // read values from san list
  let subjAltNames = uiSANInput.value;

  // replace all colons, spaces, tabs and
  // carriage returns with 1 semi-colon
  subjAltNames = subjAltNames.replace(/\n+/g,";");
  subjAltNames = subjAltNames.replace(/\t+/g,";");
  subjAltNames = subjAltNames.replace(/\,+/g,";");
  subjAltNames = subjAltNames.replace(/\s+/g,";");
  subjAltNames = subjAltNames.replace(/\;+/g,";"); // multiple ; to only one ;
  subjAltNames = subjAltNames.split(";");

  // remove empty elements
  subjAltNames = subjAltNames.filter(san => san !== "");

  // make sure that common-name is in the list
  if (subjAltNames.indexOf(commonName) < 0) {
    subjAltNames.push(commonName)
  }

  // parse subject alternative name types
  subjAltNames = parseSubjAltNames(subjAltNames);

  // add the SAN to the CSR object
  csrParam.san = subjAltNames;

  // send the csrParam object to the API
  const response = await fetch('/csr', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(csrParam)
  });

  const result = await response.json();
  console.log(result.privateKey);
  console.log(result.signingRequest);

  let t1 = performance.now();
  console.log((t1 - t0) + "ms");

  uiProgress.style.display = "none";
  uiResultPK.innerText = result.privateKey;
  uiResultCSR.innerText = result.signingRequest;
  uiResultContainer.style.display = "block";
  uiPerformance.innerText = "Request: " + (t1 - t0) + "ms";
  uiPerformance.style.display = "block";
}
