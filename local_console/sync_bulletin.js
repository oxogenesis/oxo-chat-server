const fs = require('fs')
const path = require('path')
const oxoKeyPairs = require("oxo-keypairs")

//config
// const ServerURL = "ws://127.0.0.1:8000"
const ServerURL = "wss://ru.oxo-chat-server.com"
// const Seed = "your_seed"
const Seed = "x5ChjcMhWEX4EuWmnxhrKJredj3PP"

//const GenesisHash = quarterSHA512('obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf')
const GenesisHash = 'F4C2EB8A3EBFC7B6D81676D79F928D0E'

const FileMaxSize = 16 * 1024 * 1024
const FileChunkSize = 64 * 1024
const BulletinFileExtRegex = /jpg|png|jpeg|txt|md/i

//keep alive
process.on('uncaughtException', function (err) {
  //打印出错误
  console.log(err)
  //打印出错误的调用栈方便调试
  console.log(err.stack)
})

//json
const Schema = require('./schema.js')

function cloneJson(json) {
  return JSON.parse(JSON.stringify(json))
}

function toSetUniq(arr) {
  return Array.from(new Set(arr))
}

//ws
const WebSocket = require('ws')
let ws = null

function connect() {
  ws = new WebSocket(ServerURL)
  ws.on('open', function open() {
    console.log(`connected...`)
    ws.send(genDeclare())
  })

  ws.on('message', function incoming(message) {
    handleMessage(message)
  })

  ws.on('close', function close() {
    console.log(`disconnected...`)
  })
}

function sendMessage(msg) {
  if (ws != null && ws.readyState == WebSocket.OPEN) {
    ws.send(msg)
  } else {
    connect()
  }
}

//crypto
const Crypto = require('crypto')

function hasherSHA512(str) {
  let sha512 = Crypto.createHash("sha512")
  sha512.update(str)
  return sha512.digest('hex')
}

function halfSHA512(str) {
  return hasherSHA512(str).toUpperCase().substr(0, 64)
}

function quarterSHA512(str) {
  return hasherSHA512(str).toUpperCase().substr(0, 32);
}

function genFileHashSync(file_path) {
  let file_content
  try {
    file_content = fs.readFileSync(file_path)
  } catch (err) {
    console.error(err)
    return null
  }

  const sha1 = Crypto.createHash('sha1')
  sha1.update(file_content)
  return sha1.digest('hex').toUpperCase()
}

//oxo

function strToHex(str) {
  let arr = []
  let length = str.length
  for (let i = 0; i < length; i++) {
    arr[i] = (str.charCodeAt(i).toString(16))
  }
  return arr.join('').toUpperCase()
}

function sign(msg, sk) {
  let msgHexStr = strToHex(msg)
  let sig = oxoKeyPairs.sign(msgHexStr, sk)
  return sig
}

function verifySignature(msg, sig, pk) {
  let hexStrMsg = strToHex(msg)
  try {
    return oxoKeyPairs.verify(hexStrMsg, sig, pk)
  } catch (e) {
    return false
  }
}

function VerifyJsonSignature(json) {
  let sig = json["Signature"]
  delete json["Signature"]
  let tmpMsg = JSON.stringify(json)
  if (verifySignature(tmpMsg, sig, json.PublicKey)) {
    json["Signature"] = sig
    return true
  } else {
    console.log('signature invalid...')
    return false
  }
}

let ActionCode = {
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

//message
const MessageCode = {
  "JsonSchemaInvalid": 0, //json schema invalid...
  "SignatureInvalid": 1, //signature invalid...
  "TimestampInvalid": 2, //timestamp invalid...
  "BalanceInsufficient": 3, //balance insufficient...
  "NewConnectionOpening": 4, //address changed...
  "AddressChanged": 5, //new connection with same address is opening...
  "ToSelfIsForbidden": 6, //To self is forbidden...
  "ToNotExist": 7, //To not exist...

  "GatewayDeclareSuccess": 1000 //gateway declare success...
}

const ObjectType = {
  Bulletin: 101,
  BulletinFileChunk: 102,

  PrivateFile: 201,

  GroupManage: 301,
  GroupMessage: 302,
  GroupFile: 303
}

const sqlite3 = require('sqlite3')

let DB = null

function initDB() {
  //建库：数据库名为账号地址
  DB = new sqlite3.Database(`./cache.db`)
  //建表
  DB.serialize(() => {
    //为账号地址起名
    DB.run(`CREATE TABLE IF NOT EXISTS BULLETINS(
      hash VARCHAR(32) PRIMARY KEY,
      pre_hash VARCHAR(32),
      next_hash VARCHAR(32),
      address VARCHAR(35) NOT NULL,
      sequence INTEGER NOT NULL,
      content TEXT NOT NULL,
      quote TEXT NOT NULL,
      file TEXT NOT NULL,
      json TEXT NOT NULL,
      signed_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL)`, err => {
      if (err) {
        console.log(err)
      }
    })

    DB.run(`CREATE TABLE IF NOT EXISTS QUOTES(
      main_hash VARCHAR(32) NOT NULL,
      quote_hash VARCHAR(32) NOT NULL,
      address VARCHAR(35) NOT NULL,
      sequence INTEGER NOT NULL,
      content TEXT NOT NULL,
      signed_at INTEGER NOT NULL,
      PRIMARY KEY ( main_hash, quote_hash ) )`, err => {
      if (err) {
        console.log(err)
      }
    })

    DB.run(`CREATE TABLE IF NOT EXISTS FILES(
      hash VARCHAR(32) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      ext VARCHAR(255) NOT NULL,
      size INTEGER NOT NULL,
      chunk_length INTEGER NOT NULL,
      chunk_cursor INTEGER NOT NULL )`, err => {
      if (err) {
        console.log(err)
      }
    })
  })
}

////////hard copy from client<<<<<<<<
const crypto = require("crypto")

const keypair = oxoKeyPairs.deriveKeypair(Seed)
const Address = oxoKeyPairs.deriveAddress(keypair.publicKey)
const PublicKey = keypair.publicKey
const PrivateKey = keypair.privateKey

function sign(msg, sk) {
  let msgHexStr = strToHex(msg);
  let sig = oxoKeyPairs.sign(msgHexStr, sk);
  return sig;
}

function signJson(json) {
  let sig = sign(JSON.stringify(json), PrivateKey)
  json.Signature = sig
  return json
}

function genDeclare() {
  let json = {
    "Action": ActionCode.Declare,
    "Timestamp": new Date().getTime(),
    "PublicKey": PublicKey
  }
  return JSON.stringify(signJson(json))
}

function genObjectResponse(object, to) {
  let json = {
    "Action": ActionCode.ObjectResponse,
    "Object": object,
    "To": to,
    "Timestamp": Date.now(),
    "PublicKey": PublicKey,
  }
  let sig = sign(JSON.stringify(json), PrivateKey)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}

function genBulletinRequest(address, sequence, to) {
  let json = {
    "Action": ActionCode.BulletinRequest,
    "Address": address,
    "Sequence": sequence,
    "To": to,
    "Timestamp": Date.now(),
    "PublicKey": PublicKey
  }
  return JSON.stringify(signJson(json))
}

function genBulletinFileChunkRequest(hash, chunk_cursor, to) {
  let json = {
    Action: ActionCode.BulletinFileChunkRequest,
    Hash: hash,
    Cursor: chunk_cursor,
    To: to,
    Timestamp: Date.now(),
    PublicKey: PublicKey
  }
  return JSON.stringify(signJson(json))
}

function genBulletinJson(sequence, pre_hash, quote, file, content, timestamp) {
  let json = {
    "ObjectType": ObjectType.Bulletin,
    "Sequence": sequence,
    "PreHash": pre_hash,
    "Quote": quote,
    "File": file,
    "Content": content,
    "Timestamp": timestamp,
    "PublicKey": PublicKey
  }
  return signJson(json)
}

function genBulletinAddressListRequest(page) {
  let json = {
    "Action": ActionCode.BulletinAddressListRequest,
    "Page": page,
    "Timestamp": Date.now(),
    "PublicKey": PublicKey
  }
  return JSON.stringify(signJson(json))
}

function genBulletinReplyListRequest(hash, page) {
  let json = {
    "Action": ActionCode.BulletinReplyListRequest,
    "Hash": hash,
    "Page": page,
    "Timestamp": Date.now(),
    "PublicKey": PublicKey
  }
  return signJson(json)
}

function CacheBulletin(bulletin) {
  let timestamp = Date.now()
  let hash = quarterSHA512(JSON.stringify(bulletin))
  let address = oxoKeyPairs.deriveAddress(bulletin.PublicKey)
  let SQL = `INSERT INTO BULLETINS (hash, pre_hash, address, sequence, content, quote, file, json, signed_at, created_at)
    VALUES ('${hash}', '${bulletin.PreHash}', '${address}', '${bulletin.Sequence}', '${bulletin.Content}', '${JSON.stringify(bulletin.Quote)}', '${JSON.stringify(bulletin.File)}', '${JSON.stringify(bulletin)}', ${bulletin.Timestamp}, ${timestamp})`
  DB.run(SQL, err => {
    if (err) {
      console.log(err)
    } else {
      let file_list = bulletin.File
      if (file_list && file_list.length > 0) {
        for (let i = 0; i < file_list.length; i++) {
          const file = file_list[i]
          SQL = `SELECT * FROM FILES WHERE hash = "${file.Hash}"`
          DB.get(SQL, (err, item) => {
            if (err) {
              console.log(err)
            } else {
              if (item == null) {
                let chunk_length = Math.ceil(file.Size / FileChunkSize)
                SQL = `INSERT INTO FILES (hash, name, ext, size, chunk_length, chunk_cursor)
                  VALUES ('${file.Hash}', '${file.Name}', '${file.Ext}', ${file.Size}, ${chunk_length}, 0)`
                DB.run(SQL, err => {
                  if (err) {
                    console.log(err)
                  } else {
                    let msg = genBulletinFileChunkRequest(file.Hash, 1, address)
                    sendMessage(msg)
                  }
                })
              }
            }
          })
        }
      }

      let quote_list = bulletin.Quote
      if (quote_list && quote_list.length > 0) {
        for (let i = 0; i < quote_list.length; i++) {
          const quote = quote_list[i]
          SQL = `SELECT * FROM QUOTES WHERE main_hash = "${quote.Hash}" AND quote_hash = "${hash}"`
          DB.get(SQL, (err, item) => {
            if (err) {
              console.log(err)
            } else {
              if (item == null) {
                SQL = `INSERT INTO QUOTES (main_hash, quote_hash, address, sequence, content, signed_at)
                  VALUES ('${quote.Hash}', '${hash}', '${address}', ${bulletin.Sequence}, '${bulletin.Content}', ${bulletin.Timestamp})`
                DB.run(SQL, err => {
                  if (err) {
                    console.log(err)
                  } else {
                  }
                })
              }
            }
          })
        }
      }

      console.log(`CacheBulletin:${address}#${bulletin.Sequence}`)
      let msg = genBulletinRequest(address, bulletin.Sequence + 1, address)
      sendMessage(msg)
    }
  })
}

function handleMessage(message) {
  let json = JSON.parse(message)
  console.log(json)
  if (json["To"] != null) {
    //cache bulletin
    if (json.Action == ActionCode.ObjectResponse && json.Object.ObjectType == ObjectType.Bulletin) {
      CacheBulletin(json.Object)
    } else if (json.Action == ActionCode.ObjectResponse && json.Object.ObjectType == ObjectType.BulletinFileChunk) {
      //cache bulletin file
      let address = oxoKeyPairs.deriveAddress(json.PublicKey)
      let SQL = `SELECT * FROM FILES WHERE hash = "${json.Object.Hash}"`
      DB.get(SQL, (err, bulletin_file) => {
        if (err) {
          console.log(err)
        } else {
          if (bulletin_file != null) {
            let file_dir = `./BulletinFile/${json.Object.Hash.substring(0, 3)}/${json.Object.Hash.substring(3, 6)}`
            let file_path = `${file_dir}/${json.Object.Hash}`
            fs.mkdirSync(path.resolve(file_dir), { recursive: true })
            if (bulletin_file.chunk_cursor < bulletin_file.chunk_length) {
              const utf8_buffer = Buffer.from(json.Object.Content, 'base64')
              fs.appendFileSync(path.resolve(file_path), utf8_buffer)
              let current_chunk_cursor = bulletin_file.chunk_cursor + 1
              SQL = `UPDATE FILES SET chunk_cursor = ${current_chunk_cursor} WHERE hash = "${json.Object.Hash}"`
              DB.run(SQL, err => {
                if (err) {
                  console.log(err)
                } else {
                  if (current_chunk_cursor < bulletin_file.chunk_length) {
                    // fetch next file chunk
                    let msg = genBulletinFileChunkRequest(json.Object.Hash, current_chunk_cursor + 1, address)
                    sendMessage(msg)
                  } else {
                    // compare hash
                    let hash = genFileHashSync(path.resolve(file_path))
                    if (hash != json.Object.Hash) {
                      fs.rmSync(path.resolve(file_path))
                      SQL = `UPDATE FILES SET chunk_cursor = 0 WHERE hash = "${json.Object.Hash}"`
                      DB.run(SQL, err => {
                        if (err) {
                          console.log(err)
                        } else {
                          let msg = genBulletinFileChunkRequest(json.Object.Hash, 1, address)
                          sendMessage(msg)
                        }
                      })
                    }
                  }
                }
              })
            }
          }
        }
      })
    }
  } else if (json.ObjectType == ObjectType.Bulletin) {
    CacheBulletin(json)
  }

  if (json.Action == ActionCode.BulletinRequest) {
    //send cache bulletin
    let SQL = `SELECT * FROM BULLETINS WHERE address = "${json.Address}" AND sequence = "${json.Sequence}"`
    DB.get(SQL, (err, item) => {
      if (err) {
        console.log(err)
      } else {
        console.log(`>>>server request #${json.Sequence}`)
        if (item != null) {
          let address = oxoKeyPairs.deriveAddress(json["PublicKey"])
          let bulletin_json = JSON.parse(item.json)
          let msg = genObjectResponse(bulletin_json, address)
          sendMessage(msg)
          console.log(`<done`)
        } else {
          SQL = `SELECT * FROM BULLETINS WHERE address = "${json.Address}" ORDER BY sequence DESC LIMIT 1`
          DB.get(SQL, (err, item) => {
            if (err) {
              console.log(err)
            } else {
              let local_seq = 0
              if (item != null) {
                local_seq = item.sequence
              }
              console.log(`===local sequence is #${local_seq}`)
              // sync from server
              if (local_seq < json.Sequence - 1) {
                let msg = genBulletinRequest(Address, local_seq + 1, Address)
                sendMessage(msg)
              }

              sync()
            }
          })
        }
      }
    })
  } else if (json["To"] == Address && json.Action == ActionCode.ObjectResponse && json.Object.ObjectType == ObjectType.Bulletin) {
    CacheBulletin(json.Object)
    //fetch more bulletin
    let msg = genBulletinRequest(Address, json.Object.Sequence + 1, Address)
    sendMessage(msg)
  } else if (json.Action == ActionCode.BulletinAddressListResponse) {
    let account_list = json.List
    if (account_list.length > 0) {
      for (let i = 0; i < account_list.length; i++) {
        const account = account_list[i]
        SQL = `SELECT * FROM BULLETINS WHERE address = "${account.Address}" ORDER BY sequence DESC LIMIT 1`
        DB.get(SQL, (err, bulletin) => {
          if (err) {
            console.log(err)
          } else {
            let next_sequence = 1
            if (bulletin) {
              next_sequence = bulletin.sequence + 1
            }
            let msg = genBulletinRequest(account.Address, next_sequence, account.Address)
            sendMessage(msg)
          }
        })
      }

      let next_page = json.Page + 1
      let msg = genBulletinAddressListRequest(next_page)
      sendMessage(msg)
    }
  }
}

function sync() {
  // clone all bulletin from server
  let msg = genBulletinAddressListRequest(1)
  sendMessage(msg)

  let SQL = `SELECT * FROM FILES WHERE chunk_length != chunk_cursor`
  DB.all(SQL, (err, files) => {
    if (err) {
      console.log(err)
    } else {
      console.log(files)
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          let msg = genBulletinFileChunkRequest(file.hash, file.chunk_cursor + 1, '')
          sendMessage(msg)
        }
      }
    }
  })
}

function init() {
  initDB()
  console.log(`use account: ${Address}`)

  let SQL = `SELECT * FROM BULLETINS`
  DB.all(SQL, (err, items) => {
    if (err) {
      console.log(err)
    } else {
      console.log(`BulletinCount: ${items.length}`)
    }
  })

  SQL = `SELECT * FROM FILES`
  DB.all(SQL, (err, items) => {
    if (err) {
      console.log(err)
    } else {
      console.log(`****FileCount: ${items.length}`)
    }
  })

  SQL = `SELECT * FROM BULLETINS GROUP BY address`
  DB.all(SQL, (err, items) => {
    if (err) {
      console.log(err)
    } else {
      console.log(`*AddressCount: ${items.length}`)
    }
  })

  connect()
}

init()