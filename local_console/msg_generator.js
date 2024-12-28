const { ActionCode, ObjectType } = require('./oxo_const')
const { GenSignature, SignJson } = require('./oxo_util.js')
const { QuarterSHA512 } = require('./util.js')

function GenDeclare(pk, sk, url) {
  let json = {
    Action: ActionCode.Declare,
    URL: url,
    Timestamp: Date.now(),
    PublicKey: pk
  }
  return JSON.stringify(SignJson(json, sk))
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
  let sig = GenSignature(JSON.stringify(tmp_json), sk)
  let json = {
    Action: ActionCode.ObjectResponse,
    Object: object,
    To: to,
    Timestamp: timestamp,
    PublicKey: pk,
    Signature: sig
  }
  return JSON.stringify(json)
}

// ***Bulletin***
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
  if (quote == null || quote.length == 0) {
    delete tmp_json["Quote"]
  }
  if (file == null || file.length == 0) {
    delete tmp_json["File"]
  }
  let sig = GenSignature(JSON.stringify(tmp_json), sk)

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
  if (quote == null || quote.length == 0) {
    delete json["Quote"]
  }
  if (file == null || file.length == 0) {
    delete json["File"]
  }
  return json
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
  return JSON.stringify(SignJson(json, sk))
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
  return JSON.stringify(SignJson(json, sk))
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

function GenBulletinAddressListRequest(page, pk, sk) {
  let json = {
    Action: ActionCode.BulletinAddressListRequest,
    Page: page,
    Timestamp: Date.now(),
    PublicKey: pk
  }
  return JSON.stringify(SignJson(json, sk))
}

function GenBulletinAddressListResponse(page, address_list, pk, sk) {
  let json = {
    Action: ActionCode.BulletinAddressListResponse,
    Page: page,
    List: address_list,
    Timestamp: Date.now(),
    PublicKey: pk
  }
  let sig = GenSignature(JSON.stringify(json), sk)
  json.Signature = sig
  return JSON.stringify(json)
}

function GenBulletinReplyListResponse(hash, page, reply_list) {
  let json = {
    Action: ActionCode.BulletinReplyListResponse,
    Hash: hash,
    Page: page,
    List: reply_list
  }
  return JSON.stringify(json)
}

// ***Chat***
function GenChatMessageSync(pair_address, current_sequence, pk, sk) {
  let json = {
    Action: ActionCode.ChatMessageSyncFromServer,
    PairAddress: pair_address,
    CurrentSequence: current_sequence,
    Timestamp: Date.now(),
    PublicKey: pk,
  }
  let sig = GenSignature(JSON.stringify(json), sk)
  json.Signature = sig
  return JSON.stringify(json)
}

module.exports = {
  GenDeclare,
  GenObjectResponse,

  GenBulletinJson,
  GenBulletinRequest,
  GenBulletinFileChunkRequest,
  GenBulletinFileChunkJson,
  GenBulletinAddressListRequest,
  GenBulletinAddressListResponse,
  GenBulletinReplyListResponse,

  GenChatMessageSync
}