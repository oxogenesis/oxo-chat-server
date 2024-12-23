const oxoKeyPairs = require("oxo-keypairs")
const { StrToHex, QuarterSHA512 } = require('./Util.js')

// const GenesisHash = QuarterSHA512('obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf')
const GenesisAddress = 'obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf'
const GenesisHash = 'F4C2EB8A3EBFC7B6D81676D79F928D0E'

const FileMaxSize = 16 * 1024 * 1024
const FileChunkSize = 64 * 1024
const BulletinFileExtRegex = /jpg|png|jpeg|txt|md/i

const PageSize = 20

const ActionCode = {
  Declare: 100,
  ObjectResponse: 101,

  BulletinRequest: 200,
  BulletinRandomRequest: 201,
  BulletinFileChunkRequest: 202,
  BulletinAddressListRequest: 203,
  BulletinAddressListResponse: 204,
  BulletinReplyListRequest: 205,
  BulletinReplyListResponse: 206,

  ChatMessageSync: 301,
  ChatMessageSyncFromServer: 302,
  ChatFileRequest: 303,

  // GroupRequest: 401,
  // GroupManageSync: 402,
  // GroupDH: 403,
  // GroupMessageSync: 404,
  // GroupFileRequest: 405
}

const ObjectType = {
  Bulletin: 101,
  BulletinFileChunk: 102,

  ChatDH: 201,
  ChatMessage: 202,
  ChatFileChunk: 203,

  // GroupManage: 301,
  // GroupMessage: 302,
  // GroupFileChunk: 303
}

const MessageCode = {
  JsonSchemaInvalid: 0, //json schema invalid...
  SignatureInvalid: 1, //signature invalid...
  TimestampInvalid: 2, //timestamp invalid...
  BalanceInsufficient: 3, //balance insufficient...
  NewConnectionOpening: 4, //address changed...
  AddressChanged: 5, //new connection with same address is opening...
  ToSelfIsForbidden: 6, //To self is forbidden...
  ToNotExist: 7, //To not exist...

  GatewayDeclareSuccess: 1000 //gateway declare success...
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
  let object_string = JSON.stringify(object)
  let object_hash = QuarterSHA512(object_string)
  let timestamp = Date.now()
  let tmp_json = {
    Action: ActionCode.ObjectResponse,
    ObjectHash: object_hash,
    To: to,
    Timestamp: timestamp,
    PublicKey: pk
  }
  let sig = sign(JSON.stringify(tmp_json), sk)
  let json = {
    Action: ActionCode.ObjectResponse,
    Object: object,
    To: to,
    Timestamp: timestamp,
    PublicKey: pk,
    Signature: sig
  }
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

function GenBulletinJson(sequence, pre_hash, quote, file, content, timestamp, pk, sk) {
  let content_hash = QuarterSHA512(content)
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
  if (quote && quote.length == 0) {
    delete tmp_json["Quote"]
  }
  if (file && file.length == 0) {
    delete tmp_json["File"]
  }
  let sig = sign(JSON.stringify(tmp_json), sk)

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
  if (quote && quote.length == 0) {
    delete json["Quote"]
  }
  if (file && file.length == 0) {
    delete json["File"]
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

function GenBulletinAddressListResponse(page, address_list, SelfPublicKey, SelfPrivateKey) {
  let json = {
    Action: ActionCode.BulletinAddressListResponse,
    Page: page,
    List: address_list,
    Timestamp: Date.now(),
    PublicKey: SelfPublicKey
  }
  let sig = sign(JSON.stringify(json), SelfPrivateKey)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}

function GenChatMessageSync(pair_address, current_sequence, pk, sk) {
  let json = {
    Action: ActionCode.ChatMessageSyncFromServer,
    PairAddress: pair_address,
    CurrentSequence: current_sequence,
    Timestamp: Date.now(),
    PublicKey: pk,
  }
  let sig = sign(JSON.stringify(json), sk)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}

function GenBulletinReplyListResponse(hash, page, reply_list) {
  let json = {
    Action: ActionCode.BulletinReplyListResponse,
    Hash: hash,
    Page: page,
    List: reply_list
  }
  let strJson = JSON.stringify(json)
  return strJson
}

module.exports = {
  GenesisHash,

  FileMaxSize,
  FileChunkSize,
  BulletinFileExtRegex,

  PageSize,

  ActionCode,
  ObjectType,
  MessageCode,

  VerifyJsonSignature,
  VerifyBulletinJson,
  VerifyObjectResponseJson,
  GenDeclare,
  GenBulletinAddressListRequest,
  GenBulletinAddressListResponse,
  GenBulletinRequest,
  GenBulletinFileChunkRequest,
  GenBulletinFileChunkJson,
  GenObjectResponse,
  GenChatMessageSync,
  GenBulletinReplyListResponse
}