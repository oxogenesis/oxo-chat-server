const fs = require('fs')
const Crypto = require('crypto')
const path = require('path')
const sqlite3 = require('sqlite3')
const WebSocket = require('ws')
const oxoKeyPairs = require("oxo-keypairs")
const Schema = require('./schema.js')

// config
// const ServerURL = "ws://127.0.0.1:8000"
const ServerURL = "wss://ru.oxo-chat-server.com"
// const Seed = "your_seed"
const Seed = oxoKeyPairs.generateSeed("RandomSeed", 'secp256k1')
const keypair = oxoKeyPairs.deriveKeypair(Seed)
const SelfAddress = oxoKeyPairs.deriveAddress(keypair.publicKey)
const SelfPublicKey = keypair.publicKey
const SelfPrivateKey = keypair.privateKey
console.log(`use account: ${SelfAddress}`)

// const GenesisHash = quarterSHA512('obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf')
const GenesisHash = 'F4C2EB8A3EBFC7B6D81676D79F928D0E'

const FileMaxSize = 16 * 1024 * 1024
const FileChunkSize = 64 * 1024
const BulletinFileExtRegex = /jpg|png|jpeg|txt|md/i

// keep alive
process.on('uncaughtException', function (err) {
  // 打印出错误
  console.log(err)
  // 打印出错误的调用栈方便调试
  console.log(err.stack)
})

// json
function cloneJson(json) {
  return JSON.parse(JSON.stringify(json))
}

function toSetUniq(arr) {
  return Array.from(new Set(arr))
}

// crypto
function hasherSHA512(str) {
  let sha512 = Crypto.createHash("sha512")
  sha512.update(str)
  return sha512.digest('hex')
}

function halfSHA512(str) {
  return hasherSHA512(str).toUpperCase().substring(0, 64)
}

// for bulletin object
function quarterSHA512(str) {
  return hasherSHA512(str).toUpperCase().substring(0, 32);
}

function strToHex(str) {
  let arr = []
  let length = str.length
  for (let i = 0; i < length; i++) {
    arr[i] = (str.charCodeAt(i).toString(16))
  }
  return arr.join('').toUpperCase()
}

function fileHashSync(file_path) {
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

// oxo
function sign(msg) {
  let msgHexStr = strToHex(msg)
  let sig = oxoKeyPairs.sign(msgHexStr, SelfPrivateKey)
  return sig
}

function signJson(json) {
  let sig = sign(JSON.stringify(json))
  json.Signature = sig
  return json
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

function GenDeclare() {
  let json = {
    Action: ActionCode.Declare,
    Timestamp: new Date().getTime(),
    PublicKey: SelfPublicKey
  }
  return JSON.stringify(signJson(json))
}

function GenObjectResponse(object, to) {
  let json = {
    Action: ActionCode.ObjectResponse,
    Object: object,
    To: to,
    Timestamp: Date.now(),
    PublicKey: SelfPublicKey,
  }
  let sig = sign(JSON.stringify(json))
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}

function GenBulletinRequest(address, sequence, to) {
  let json = {
    Action: ActionCode.BulletinRequest,
    Address: address,
    Sequence: sequence,
    To: to,
    Timestamp: Date.now(),
    PublicKey: SelfPublicKey
  }
  return JSON.stringify(signJson(json))
}

function GenBulletinFileChunkRequest(hash, chunk_cursor, to) {
  let json = {
    Action: ActionCode.BulletinFileChunkRequest,
    Hash: hash,
    Cursor: chunk_cursor,
    To: to,
    Timestamp: Date.now(),
    PublicKey: SelfPublicKey
  }
  return JSON.stringify(signJson(json))
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
    PublicKey: SelfPublicKey
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
    PublicKey: SelfPublicKey,
    Signature: sig
  }
  return json
}

function GenBulletinAddressListRequest(page) {
  let json = {
    Action: ActionCode.BulletinAddressListRequest,
    Page: page,
    Timestamp: Date.now(),
    PublicKey: SelfPublicKey
  }
  return JSON.stringify(signJson(json))
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

// db
let DB = null

function initDB() {
  // 建库：数据库名为账号地址
  DB = new sqlite3.Database(`./cache.db`)
  // 建表
  DB.serialize(() => {
    // 为账号地址起名
    DB.run(`CREATE TABLE IF NOT EXISTS BULLETINS(
      hash VARCHAR(32) PRIMARY KEY,
      pre_hash VARCHAR(32),
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

initDB()

// function
function CacheBulletin(bulletin) {
  let address = oxoKeyPairs.deriveAddress(bulletin.PublicKey)

  if (VerifyBulletinJson(bulletin)) {
    let timestamp = Date.now()
    let hash = quarterSHA512(JSON.stringify(bulletin))
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
                      let msg = GenBulletinFileChunkRequest(file.Hash, 1, address)
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
        let msg = GenBulletinRequest(address, bulletin.Sequence + 1, address)
        sendMessage(msg)
      }
    })
  } else {
    console.log(`bulletin verify failure...:${address}#${bulletin.Sequence}`)
  }
}

function handleMessage(message) {
  let json = JSON.parse(message)
  // console.log(json)
  if (json.To != null) {
    // cache bulletin
    if (json.Action == ActionCode.ObjectResponse && json.Object.ObjectType == ObjectType.Bulletin) {
      CacheBulletin(json.Object)
    } else if (json.Action == ActionCode.ObjectResponse && json.Object.ObjectType == ObjectType.BulletinFileChunk) {
      // cache bulletin file
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
                  console.log(`CacheBulletinFile:${json.Object.Hash}#${current_chunk_cursor}/${bulletin_file.chunk_length}`)
                  if (current_chunk_cursor < bulletin_file.chunk_length) {
                    // fetch next file chunk
                    let msg = GenBulletinFileChunkRequest(json.Object.Hash, current_chunk_cursor + 1, address)
                    sendMessage(msg)
                  } else {
                    // compare hash
                    let hash = fileHashSync(path.resolve(file_path))
                    if (hash != json.Object.Hash) {
                      fs.rmSync(path.resolve(file_path))
                      SQL = `UPDATE FILES SET chunk_cursor = 0 WHERE hash = "${json.Object.Hash}"`
                      DB.run(SQL, err => {
                        if (err) {
                          console.log(err)
                        } else {
                          let msg = GenBulletinFileChunkRequest(json.Object.Hash, 1, address)
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
    // send cache bulletin
    let SQL = `SELECT * FROM BULLETINS WHERE address = "${json.Address}" AND sequence = "${json.Sequence}"`
    DB.get(SQL, (err, item) => {
      if (err) {
        console.log(err)
      } else {
        console.log(`request >>> ${json.Address}#${json.Sequence}`)
        if (item != null) {
          let address = oxoKeyPairs.deriveAddress(json.PublicKey)
          let bulletin_json = JSON.parse(item.json)
          let msg = GenObjectResponse(bulletin_json, address)
          sendMessage(msg)
          console.log(`response <<< ${json.Address}#${json.Sequence}`)
        } else {
          console.log(`not found === ${json.Address}#${json.Sequence}`)
          SQL = `SELECT * FROM BULLETINS WHERE address = "${json.Address}" ORDER BY sequence DESC LIMIT 1`
          DB.get(SQL, (err, item) => {
            if (err) {
              console.log(err)
            } else {
              let local_seq = 0
              if (item != null) {
                local_seq = item.sequence
              }
              // sync from server
              if (local_seq < json.Sequence - 1) {
                let msg = GenBulletinRequest(SelfAddress, local_seq + 1, SelfAddress)
                sendMessage(msg)
              }
            }
          })
        }
      }
    })
  } else if (json.To == SelfAddress && json.Action == ActionCode.ObjectResponse && json.Object.ObjectType == ObjectType.Bulletin) {
    CacheBulletin(json.Object)
    // fetch more bulletin
    let msg = GenBulletinRequest(SelfAddress, json.Object.Sequence + 1, SelfAddress)
    sendMessage(msg)
  } else if (json.Action == ActionCode.BulletinAddressListResponse) {
    let account_list = json.List
    // pull step 2: fetch all account's bulletin
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
            let msg = GenBulletinRequest(account.Address, next_sequence, account.Address)
            sendMessage(msg)
          }
        })
      }

      let next_page = json.Page + 1
      let msg = GenBulletinAddressListRequest(next_page)
      sendMessage(msg)
    }
  }
}

function pull_bulletin() {
  // clone all bulletin from server
  // pull step 1: fetch all account
  let msg = GenBulletinAddressListRequest(1)
  sendMessage(msg)
}

function push_bulletin() {
  let SQL = `SELECT address, sequence FROM BULLETINS`
  DB.all(SQL, (err, items) => {
    if (err) {
      console.log(err)
    } else {
      let bulletin_sequence = {}
      items.forEach(item => {
        if (bulletin_sequence[item.address] == null) {
          bulletin_sequence[item.address] = item.sequence
        } else if (bulletin_sequence[item.address] < item.sequence) {
          bulletin_sequence[item.address] = item.sequence
        }
      })


      for (const address in bulletin_sequence) {
        // TODO to
        let msg = GenBulletinRequest(address, bulletin_sequence[address] + 1, address)
        sendMessage(msg)
      }
    }
  })
}

function download_bulletin_files() {
  let SQL = `SELECT * FROM FILES WHERE chunk_length != chunk_cursor`
  DB.all(SQL, (err, files) => {
    if (err) {
      console.log(err)
    } else {
      if (files && files.length > 0) {
        console.log(`--------------------------files to down------------------`)
        console.log(files)
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          let msg = GenBulletinFileChunkRequest(file.hash, file.chunk_cursor + 1, '')
          sendMessage(msg)
        }
      }
    }
  })
}

function bulletin_stat() {
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
}

function go() {
  bulletin_stat()
  pull_bulletin()
  push_bulletin()
  download_bulletin_files()
}

// ws
//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// connection Server
let ws = null

function connect() {
  ws = new WebSocket(ServerURL)
  ws.on('open', function open() {
    console.log(`connected <===> ${ServerURL}`)
    ws.send(GenDeclare())
    go()
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
  }
}

connect()

//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// connection Client
let ClientServer = null
let ClientConns = {}

// server message
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

function strServerMessage(msgCode) {
  msgJson = {
    Action: ActionCode.ServerMessage,
    Code: msgCode
  }
  return JSON.stringify(msgJson)
}

function sendServerMessage(ws, msgCode) {
  ws.send(strServerMessage(msgCode))
}

function fetchClientConnAddress(ws) {
  for (let address in ClientConns) {
    if (ClientConns[address] == ws) {
      return address
    }
  }
  return null
}

function teminateClientConn(ws) {
  ws.close()
  let connAddress = fetchClientConnAddress(ws)
  if (connAddress != null) {
    console.log(`###################LOG################### client disconnect... <${connAddress}>`)
    delete ClientConns[connAddress]
  }
}

function CacheClientBulletin(bulletin) {
  let address = oxoKeyPairs.deriveAddress(bulletin.PublicKey)

  if (VerifyBulletinJson(bulletin)) {
    let timestamp = Date.now()
    let hash = quarterSHA512(JSON.stringify(bulletin))
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
                      let msg = GenBulletinFileChunkRequest(file.Hash, 1, address)
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
        let msg = GenBulletinRequest(address, bulletin.Sequence + 1, address)
        sendMessage(msg)
      }
    })
  } else {
    console.log(`bulletin verify failure...:${address}#${bulletin.Sequence}`)
  }

  if (b == null) {
    let result = await prisma.BULLETINS.create({
      data: {
        hash: hash,
        pre_hash: bulletin.PreHash,
        address: address,
        sequence: bulletin.Sequence,
        content: bulletin.Content,
        quote: JSON.stringify(bulletin.Quote),
        file: JSON.stringify(bulletin.File),
        json: JSON.stringify(bulletin),
        signed_at: bulletin.Timestamp,
        created_at: timestamp
      }
    })

    if (result && result.sequence != 1) {
      //update pre_bulletin's next_hash
      result = await prisma.BULLETINS.update({
        where: {
          hash: bulletin.PreHash
        },
        data: {
          next_hash: hash
        }
      })

      //create quote
      bulletin.Quote.forEach(async quote => {
        result = await prisma.QUOTES.create({
          data: {
            main_hash: quote.Hash,
            quote_hash: hash,
            address: address,
            sequence: bulletin.Sequence,
            content: bulletin.Content,
            signed_at: bulletin.Timestamp
          }
        })
      })

      //create file
      bulletin.File.forEach(async file => {
        let f = await prisma.FILES.findFirst({
          where: {
            hash: file.Hash
          }
        })
        if (!f) {
          let chunk_length = Math.ceil(file.Size / FileChunkSize)
          f = await prisma.FILES.create({
            data: {
              hash: file.Hash,
              name: file.Name,
              ext: file.Ext,
              size: file.Size,
              chunk_length: chunk_length,
              chunk_cursor: 0
            }
          })
        }
        if (f.chunk_cursor < f.chunk_length) {
          let msg = GenBulletinFileChunkRequest(f.hash, f.chunk_cursor + 1, address)
          ClientConns[address].send(msg)
        }
      })

      // TODO Brocdcast to OtherServer
      // for (let i in OtherServer) {
      //   let ws = ClientConns[OtherServer[i].Address]
      //   if (ws != undefined && ws.readyState == WebSocket.OPEN) {
      //     ws.send(GenObjectResponse(bulletin, OtherServer[i].Address))
      //   }
      // }
    }
  }
}

async function handleClientMessage(message, json) {
  if (json.To != null) {
    if (ClientConns[json.To] != null && ClientConns[json.To].readyState == WebSocket.OPEN) {
      // 對方在綫
      // forward message
      ClientConns[json.To].send(`${message}`)
    }

    if (json.Action == ActionCode.ObjectResponse) {
      if (json.Object.ObjectType == ObjectType.Bulletin) {
        // cache bulletin
        CacheClientBulletin(json.Object)
        if (json.To == SelfAddress) {
          // fetch more bulletin
          let address = oxoKeyPairs.deriveAddress(json.Object.PublicKey)
          if (ClientConns[address] != null && ClientConns[address].readyState == WebSocket.OPEN) {
            let msg = GenBulletinRequest(address, json.Object.Sequence + 1, address)
            ClientConns[address].send(msg)
          }
        }
      } else if (json.Object.ObjectType == ObjectType.BulletinFileChunk) {
        //cache bulletin file
        console.log(`BulletinFileChunk........................................`)
        SQL = `SELECT * FROM FILES WHERE hash = "${json.Hash}" ORDER BY sequence DESC LIMIT 1`
        DB.get(SQL, (err, bulletin_file) => {
          if (err) {
            console.log(err)
          } else {
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
                    let address = oxoKeyPairs.deriveAddress(json.PublicKey)
                    let msg = GenBulletinFileChunkRequest(json.Object.Hash, current_chunk_cursor + 1, address)
                    ClientConns[address].send(msg)
                  } else {
                    // compare hash
                    let hash = GenFileHashSync(path.resolve(file_path))
                    if (hash != json.Object.Hash) {
                      fs.rmSync(path.resolve(file_path))
                      SQL = `UPDATE FILES SET chunk_cursor = 0 WHERE hash = "${json.Object.Hash}"`
                      DB.run(SQL, err => {
                        if (err) {
                          console.log(err)
                        } else {
                        }
                      })
                    }
                  }
                }
              })
            }
          }
        })
      }
    }
  }

  if (json.Action == ActionCode.BulletinRequest) {
    // send cache bulletin
    let SQL = `SELECT * FROM BULLETINS WHERE address = "${json.Address}" AND sequence = "${json.Sequence}"`
    DB.get(SQL, (err, item) => {
      if (err) {
        console.log(err)
      } else {
        console.log(`request >>> ${json.Address}#${json.Sequence}`)
        if (item != null) {
          let address = oxoKeyPairs.deriveAddress(json.PublicKey)
          let bulletin_json = JSON.parse(item.json)
          ClientConns[address].send(bulletin_json)
          console.log(`response <<< ${json.Address}#${json.Sequence}`)
        } else {
          console.log(`not found === ${json.Address}#${json.Sequence}`)
          SQL = `SELECT * FROM BULLETINS WHERE address = "${json.Address}" ORDER BY sequence DESC LIMIT 1`
          DB.get(SQL, (err, item) => {
            if (err) {
              console.log(err)
            } else {
              let local_seq = 0
              if (item != null) {
                local_seq = item.sequence
              }
              // sync from client
              if (local_seq < json.Sequence - 1) {
                let msg = GenBulletinRequest(SelfAddress, local_seq + 1, SelfAddress)
                ClientConns[json.Address].send(msg)
              }
            }
          })
        }
      }
    })
  } else if (json.Action == ActionCode.BulletinFileChunkRequest) {
    SQL = `SELECT * FROM FILES WHERE hash = "${json.Hash}" ORDER BY sequence DESC LIMIT 1`
    DB.get(SQL, (err, file) => {
      if (err) {
        console.log(err)
      } else {
        if (file != null) {
          if (file.chunk_cursor == file.chunk_length) {
            //send cache bulletin file
            let address = oxoKeyPairs.deriveAddress(json.PublicKey)

            let begin = (json.Cursor - 1) * FileChunkSize
            let left_size = file.size - begin
            let end = json.Cursor * FileChunkSize
            if (left_size < FileChunkSize) {
              end = begin + left_size
            }
            let file_path = path.resolve(`./BulletinFile/${json.Hash.substring(0, 3)}/${json.Hash.substring(3, 6)}/${json.Hash}`)
            let buffer = fs.readFileSync(file_path)
            let chunk = buffer.subarray(begin, end)
            // base64
            let content = chunk.toString('base64')
            let object = GenBulletinFileChunkJson(json.Hash, json.Cursor, content)
            let msg = GenObjectResponse(object, address)
            ClientConns[address].send(msg)
          } else if (json.To != "" && ClientConns[json.To]) {
            // fetch file
            let msg = GenBulletinFileChunkRequest(json.Hash, file.chunk_cursor + 1, json.To)
            ClientConns[json.To].send(msg)
          }
        }
      }
    })
  } else if (json.Action == ActionCode.BulletinAddressListRequest && json.Page > 0) {
    let address = oxoKeyPairs.deriveAddress(json.PublicKey)
    SQL = `SELECT adderss, COUNT(address) AS address_count FROM BULLETINS GROUP BY address ORDER BY address_count LIMIT ${PageSize} OFFSET ${(json.Page - 1) * PageSize}`
    DB.all(SQL, (err, accounts) => {
      if (err) {
        console.log(err)
      } else {
        let address_list = []
        accounts.forEach(account => {
          let new_account = {}
          new_account.Address = account.address
          new_account.Count = account.address_count
          address_list.push(new_account)
        })
        let msg = GenBulletinAddressListResponse(json.Page, address_list)
        ClientConns[address].send(msg)
      }
    })
  }
}

async function checkClientMessage(ws, message) {
  console.log(`###################LOG################### Client Message:`)
  console.log(`${message.slice(0, 512)}`)
  let json = Schema.checkClientSchema(message)
  if (json == false) {
    // json格式不合法
    sendServerMessage(ws, MessageCode.JsonSchemaInvalid)
    // console.log(`json格式不合法`)
    teminateClientConn(ws)
  } else {
    let client_address = oxoKeyPairs.deriveAddress(json.PublicKey)
    if (ClientConns[client_address] == ws) {
      // 连接已经通过"声明消息"校验过签名
      // "声明消息"之外的其他消息，由接收方校验
      // 伪造的"公告消息"无法通过接收方校验，也就无法被接受方看见（进而不能被引用），也就不具备传播能力
      // 伪造的"消息"无法通过接收方校验，也就无法被接受方看见
      // 所以服务器端只校验"声明消息"签名的有效性，并与之建立连接，后续消息无需校验签名，降低服务器运算压力
      handleClientMessage(message, json)
    } else {
      let connAddress = fetchClientConnAddress(ws)
      if (connAddress != null && connAddress != client_address) {
        // using different address in same connection
        sendServerMessage(ws, MessageCode.AddressChanged)
        teminateClientConn(ws)
      } else {
        if (!VerifyJsonSignature(json)) {
          // "声明消息"签名不合法
          sendServerMessage(ws, MessageCode.SignatureInvalid)
          teminateClientConn(ws)
          return
        }

        if (json.Timestamp + 60000 < Date.now()) {
          // "声明消息"生成时间过早
          sendServerMessage(ws, MessageCode.TimestampInvalid)
          teminateClientConn(ws)
          return
        }

        if (connAddress == null && ClientConns[client_address] == null) {
          // new connection and new address
          // 当前连接无对应地址，当前地址无对应连接，全新连接
          console.log(`connection established from client <${client_address}>`)
          ClientConns[client_address] = ws
          // handleClientMessage(message, json)

          // 获取最新bulletin
          SQL = `SELECT * FROM BULLETINS WHERE address = "${client_address}" ORDER BY sequence DESC LIMIT 1`
          DB.get(SQL, (err, item) => {
            if (err) {
              console.log(err)
            } else {
              let local_seq = 1
              if (item != null) {
                local_seq = item.sequence + 1
              }
              let msg = GenBulletinRequest(client_address, local_seq, client_address)
              sendMessage(msg)
              ClientConns[client_address].send(msg)
            }
          })

          // 获取未缓存的bulletin文件
          SQL = `SELECT file FROM BULLETINS`
          DB.all(SQL, (err, bulletins) => {
            if (err) {
              console.log(err)
            } else {
              let file_hash_list = []
              bulletins.forEach(async bulletin => {
                let file_list = JSON.parse(bulletin.file)
                if (file_list && file_list.length != 0) {
                  file_list.forEach(async file => {
                    file_hash_list.push(file.Hash)
                  })
                }
              })
              file_hash_list = toSetUniq(file_hash_list)

              SQL = `SELECT * FROM FILES hash IN (${file_hash_list}) AND chunk_length > chunk_cursor`
              DB.all(SQL, (err, files) => {
                if (err) {
                  console.log(err)
                } else {
                  console.log('file_list', files)
                  files.forEach(async file => {
                    let msg = GenBulletinFileChunkRequest(file.hash, file.chunk_cursor + 1, client_address)
                    ClientConns[client_address].send(msg)
                  })
                }
              })
            }
          })
        } else if (ClientConns[client_address] != ws && ClientConns[client_address].readyState == WebSocket.OPEN) {
          // new connection kick old conection with same address
          // 当前地址有对应连接，断开旧连接，当前地址对应到当前连接
          sendServerMessage(ClientConns[client_address], MessageCode.NewConnectionOpening)
          ClientConns[client_address].close()
          ClientConns[client_address] = ws
          // handleClientMessage(message, json)
        } else {
          ws.send("WTF...")
          teminateClientConn(ws)
        }
      }
    }
  }
}

function startClientServer() {
  if (ClientServer == null) {
    ClientServer = new WebSocket.Server({
      port: 8000, //to bind on 80, must use "sudo node main.js"
      clientTracking: true,
      maxPayload: 512 * 1024
    })

    ClientServer.on("connection", function connection(ws) {
      ws.on("message", function incoming(message) {
        checkClientMessage(ws, message)
      })

      ws.on("close", function close() {
        let connAddress = fetchClientConnAddress(ws)
        if (connAddress != null) {
          console.log(`client <${connAddress}> disconnect...`)
          delete ClientConns[connAddress]
        }
      })
    })
  }
}

startClientServer()