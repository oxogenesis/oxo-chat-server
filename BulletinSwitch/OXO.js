const oxoKeyPairs = require("oxo-keypairs")
const { StrToHex } = require('./Util.js')

// const GenesisHash = quarterSHA512('obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf')
const GenesisHash = 'F4C2EB8A3EBFC7B6D81676D79F928D0E'

const FileMaxSize = 16 * 1024 * 1024
const FileChunkSize = 64 * 1024
const BulletinFileExtRegex = /jpg|png|jpeg|txt|md/i

const ActionCode = {
  Declare: 100,
  ObjectResponse: 101,

  BulletinRandom: 200,
  BulletinRequest: 201,
  BulletinFileChunkRequest: 202,
  BulletinAddressListRequest: 203,
  BulletinAddressListResponse: 204,
  BulletinReplyListRequest: 205,
  BulletinReplyListResponse: 206,

  ChatDH: 301,
  ChatMessage: 302,
  ChatSync: 303,
  PrivateFileRequest: 304,
  ChatSyncFromServer: 305,

  GroupRequest: 401,
  GroupManageSync: 402,
  GroupDH: 403,
  GroupMessageSync: 404,
  GroupFileRequest: 405
}

const ObjectType = {
  Bulletin: 101,
  BulletinFileChunk: 102,

  PrivateFile: 201,

  GroupManage: 301,
  GroupMessage: 302,
  GroupFile: 303
}

// oxo
function sign(msg, sk) {
  let msgHexStr = StrToHex(msg)
  let sig = oxoKeyPairs.sign(msgHexStr, sk)
  return sig
}

function signJson(json, sk) {
  let sig = sign(JSON.stringify(json), sk)
  json.Signature = sig
  return json
}

function verifySignature(msg, sig, pk) {
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
    console.log('signature invalid...')
    return false
  }
}

function VerifyBulletinJson(bulletin) {
  let content_hash = quarterSHA512(bulletin.Content)
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
  return VerifyJsonSignature(tmp_json)
}

function GenDeclare(pk, sk, url) {
  let json = {
    Action: ActionCode.Declare,
    URL: url,
    Timestamp: Date.now(),
    PublicKey: pk
  }
  return JSON.stringify(signJson(json, sk))
}

function GenObjectResponse(object, to, pk, sk) {
  let json = {
    Action: ActionCode.ObjectResponse,
    Object: object,
    To: to,
    Timestamp: Date.now(),
    PublicKey: pk,
  }
  let sig = sign(JSON.stringify(json), sk)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}

function GenBulletinRequest(address, sequence, to, pk, sk) {
  let json = {
    Action: ActionCode.BulletinRequest,
    Address: address,
    Sequence: sequence,
    To: to,
    Timestamp: Date.now(),
    PublicKey: pk
  }
  return JSON.stringify(signJson(json, sk))
}

function GenBulletinFileChunkRequest(hash, chunk_cursor, to, pk, sk) {
  let json = {
    Action: ActionCode.BulletinFileChunkRequest,
    Hash: hash,
    Cursor: chunk_cursor,
    To: to,
    Timestamp: Date.now(),
    PublicKey: pk
  }
  return JSON.stringify(signJson(json, sk))
}

function GenBulletinFileChunkJson(hash, chunk_cursor, content) {
  let json = {
    "ObjectType": ObjectType.BulletinFileChunk,
    "Hash": hash,
    "Cursor": chunk_cursor,
    "Content": content
  }
  return json
}

function GenBulletinJson(sequence, pre_hash, quote, file, content, timestamp) {
  let content_hash = quarterSHA512(content)
  let tmp_json = {
    ObjectType: ObjectType.Bulletin,
    Sequence: sequence,
    PreHash: pre_hash,
    Quote: quote,
    File: file,
    ContentHash: content_hash,
    Timestamp: timestamp,
    PublicKey: pk
  }
  let sig = sign(JSON.stringify(tmp_json))

  let json = {
    ObjectType: ObjectType.Bulletin,
    Sequence: sequence,
    PreHash: pre_hash,
    Quote: quote,
    File: file,
    Content: content,
    Timestamp: timestamp,
    PublicKey: pk,
    Signature: sig
  }
  return json
}

function GenBulletinAddressListRequest(page, pk, sk) {
  let json = {
    Action: ActionCode.BulletinAddressListRequest,
    Page: page,
    Timestamp: Date.now(),
    PublicKey: pk
  }
  return JSON.stringify(signJson(json, sk))
}

function GenBulletinAddressListResponse(page, address_list) {
  let json = {
    Action: ActionCode.BulletinAddressListResponse,
    Page: page,
    List: address_list
  }
  let strJson = JSON.stringify(json)
  return strJson
}

module.exports = {
  GenesisHash,

  FileMaxSize,
  FileChunkSize,
  BulletinFileExtRegex,

  ActionCode,
  ObjectType,

  VerifyJsonSignature,
  GenDeclare,
  GenBulletinAddressListRequest,
  GenBulletinRequest,
  GenBulletinFileChunkRequest,
  GenObjectResponse
}