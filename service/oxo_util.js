const oxoKeyPairs = require("oxo-keypairs")
const { StrToHex, QuarterSHA512 } = require('./Util.js')

function GenSignature(str, sk) {
  let strHex = StrToHex(str)
  let sig = oxoKeyPairs.sign(strHex, sk)
  return sig
}

function SignJson(json, sk) {
  let sig = GenSignature(JSON.stringify(json), sk)
  json.Signature = sig
  return json
}

function VerifySignature(msg, sig, pk) {
  let hexStrMsg = StrToHex(msg)
  try {
    return oxoKeyPairs.verify(hexStrMsg, sig, pk)
  } catch (e) {
    return false
  }
}

function VerifyJsonSignature(json) {
  let sig = json.Signature
  delete json.Signature
  let tmpMsg = JSON.stringify(json)
  if (verifySignature(tmpMsg, sig, json.PublicKey)) {
    json.Signature = sig
    return true
  } else {
    console.log('json signature invalid...')
    return false
  }
}

function VerifyBulletinJson(bulletin) {
  let content_hash = QuarterSHA512(bulletin.Content)
  let tmp_json = {
    ObjectType: ObjectType.Bulletin,
    Sequence: bulletin.Sequence,
    PreHash: bulletin.PreHash,
    Quote: bulletin.Quote,
    File: bulletin.File,
    ContentHash: content_hash,
    Timestamp: bulletin.Timestamp,
    PublicKey: bulletin.PublicKey,
    Signature: bulletin.Signature
  }
  if (!bulletin.Quote) {
    delete tmp_json.Quote
  }
  if (!bulletin.File) {
    delete tmp_json.File
  }
  return VerifyJsonSignature(tmp_json)
}

function VerifyObjectResponseJson(object_response) {
  let object_string = JSON.stringify(object_response.Object)
  let object_hash = QuarterSHA512(object_string)
  let tmp_json = {
    Action: ActionCode.ObjectResponse,
    ObjectHash: object_hash,
    To: object_response.To,
    Timestamp: object_response.Timestamp,
    PublicKey: object_response.PublicKey,
    Signature: object_response.Signature
  }
  return VerifyJsonSignature(tmp_json)
}

module.exports = {
  GenSignature,
  SignJson,
  VerifySignature,
  VerifyJsonSignature,
  VerifyBulletinJson,
  VerifyObjectResponseJson
}