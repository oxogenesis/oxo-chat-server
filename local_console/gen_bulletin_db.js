const fs = require('fs')
const Crypto = require('crypto')
const path = require('path')
const sqlite3 = require('sqlite3')
const oxoKeyPairs = require("oxo-keypairs")

//const GenesisHash = quarterSHA512('obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf')
const GenesisHash = 'F4C2EB8A3EBFC7B6D81676D79F928D0E'

const FileMaxSize = 16 * 1024 * 1024
const FileChunkSize = 64 * 1024
const BulletinFileExtRegex = /jpg|png|jpeg|txt|md/i

//config
// const Seed = "your_seed"
const Seed = ""

const keypair = oxoKeyPairs.deriveKeypair(Seed)
const Address = oxoKeyPairs.deriveAddress(keypair.publicKey)
const PublicKey = keypair.publicKey
const PrivateKey = keypair.privateKey
const SourDBPath = `./cache.db`
const SourTable = `BULLETINS`
const SourCondition = `address = '${Address}'`
const SourColumnQuote = `quote`
const SourColumnFile = `file`
const SourColumnContent = `content`
const SourColumnTimestamp = `signed_at`

const DestDBPath = `./${Address}.db`
let CurrentSequence = 0
let CurrentPreHash = GenesisHash

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

//crypto
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

function strToHex(str) {
  let arr = []
  let length = str.length
  for (let i = 0; i < length; i++) {
    arr[i] = (str.charCodeAt(i).toString(16))
  }
  return arr.join('').toUpperCase()
}

//oxo
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

function sign(msg, sk) {
  let msgHexStr = strToHex(msg)
  let sig = oxoKeyPairs.sign(msgHexStr, sk)
  return sig
}

// function sign(msg, sk) {
//   let msgHexStr = strToHex(msg)
//   let sig = oxoKeyPairs.sign(msgHexStr, sk)
//   return sig
// }

function signJson(json) {
  let sig = sign(JSON.stringify(json), PrivateKey)
  json.Signature = sig
  return json
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

//message generator
const ObjectType = {
  Bulletin: 101,
  BulletinFileChunk: 102,

  PrivateFile: 201,

  GroupManage: 301,
  GroupMessage: 302,
  GroupFile: 303
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

function genBulletinJson(sequence, pre_hash, quote, file, content, timestamp) {
  let content_hash = quarterSHA512(content)
  let tmp_json = {
    "ObjectType": ObjectType.Bulletin,
    "Sequence": sequence,
    "PreHash": pre_hash,
    "Quote": quote,
    "File": file,
    "ContentHash": content_hash,
    "Timestamp": timestamp,
    "PublicKey": PublicKey
  }
  let sig = sign(JSON.stringify(tmp_json), PrivateKey)

  let json = {
    "ObjectType": ObjectType.Bulletin,
    "Sequence": sequence,
    "PreHash": pre_hash,
    "Quote": quote,
    "File": file,
    "Content": content,
    "Timestamp": timestamp,
    "PublicKey": PublicKey,
    "Signature": sig
  }
  return json
}

// db
let SourDB = new sqlite3.Database(SourDBPath)
let DestDB = new sqlite3.Database(DestDBPath)

function initDestDB() {
  //建表
  DestDB.serialize(() => {
    //为账号地址起名
    DestDB.run(`CREATE TABLE IF NOT EXISTS BULLETINS(
      hash VARCHAR(32) PRIMARY KEY,
      pre_hash VARCHAR(32),
      address VARCHAR(35) NOT NULL,
      sequence INTEGER NOT NULL,
      content TEXT NOT NULL,
      quote TEXT NOT NULL,
      file TEXT NOT NULL,
      json TEXT NOT NULL,
      signed_at INTEGER NOT NULL)`, err => {
      if (err) {
        console.log(err)
      }
    })

    DestDB.run(`CREATE TABLE IF NOT EXISTS FILES(
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

function CacheBulletin(bulletin) {
  let timestamp = Date.now()
  let hash = quarterSHA512(JSON.stringify(bulletin))
  let address = oxoKeyPairs.deriveAddress(bulletin.PublicKey)
  let SQL = `INSERT INTO BULLETINS (hash, pre_hash, address, sequence, content, quote, file, json, signed_at, created_at)
    VALUES ('${hash}', '${bulletin.PreHash}', '${address}', '${bulletin.Sequence}', '${bulletin.Content}', '${JSON.stringify(bulletin.Quote)}', '${JSON.stringify(bulletin.File)}', '${JSON.stringify(bulletin)}', ${bulletin.Timestamp}, ${timestamp})`
  DestDB.run(SQL, err => {
    if (err) {
      console.log(err)
    } else {
      let file_list = bulletin.File
      if (file_list && file_list.length > 0) {
        for (let i = 0; i < file_list.length; i++) {
          const file = file_list[i]
          SQL = `SELECT * FROM FILES WHERE hash = "${file.Hash}"`
          DestDB.get(SQL, (err, item) => {
            if (err) {
              console.log(err)
            } else {
              if (item == null) {
                let chunk_length = Math.ceil(file.Size / FileChunkSize)
                SQL = `INSERT INTO FILES (hash, name, ext, size, chunk_length, chunk_cursor)
                  VALUES ('${file.Hash}', '${file.Name}', '${file.Ext}', ${file.Size}, ${chunk_length}, 0)`
                DestDB.run(SQL, err => {
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
          DestDB.get(SQL, (err, item) => {
            if (err) {
              console.log(err)
            } else {
              if (item == null) {
                SQL = `INSERT INTO QUOTES (main_hash, quote_hash, address, sequence, content, signed_at)
                  VALUES ('${quote.Hash}', '${hash}', '${address}', ${bulletin.Sequence}, '${bulletin.Content}', ${bulletin.Timestamp})`
                DestDB.run(SQL, err => {
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
      DestDB.get(SQL, (err, bulletin_file) => {
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
              DestDB.run(SQL, err => {
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
                      DestDB.run(SQL, err => {
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
    DestDB.get(SQL, (err, item) => {
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
          DestDB.get(SQL, (err, item) => {
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
        DestDB.get(SQL, (err, bulletin) => {
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
  DestDB.all(SQL, (err, files) => {
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

async function queryAll(sql) {
  return new Promise((resolve, reject) => {
    DestDB.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
      db.close();
    });
  });
}

async function runSql(sql) {
  return new Promise((resolve, reject) => {
    DestDB.run(sql, err => {
      if (err) {
        console.log(err)
        reject(err)
      } else {
        resolve(true)
      }
    })
  })
}

function gen() {
  let begin_at = Date.now()

  let SQL = `SELECT * FROM ${SourTable} where ${SourCondition} ORDER BY ${SourColumnTimestamp} ASC`
  SourDB.all(SQL, async (err, bulletins) => {
    if (err) {
      console.log(err)
    } else {
      console.log(`BulletinCount: ${bulletins.length}`)

      for (let i = 0; i < bulletins.length; i++) {
        const tmp_bulletin = bulletins[i]
        let quote = tmp_bulletin[SourColumnQuote] || []
        let file = tmp_bulletin[SourColumnFile] || []
        let content = tmp_bulletin[SourColumnContent].replace(/<br>/g, '\n')
        let timestamp = tmp_bulletin[SourColumnTimestamp]
        let bulletin = genBulletinJson(CurrentSequence + 1, CurrentPreHash, quote, file, content, timestamp)
        let bulletin_str = JSON.stringify(bulletin)
        let hash = quarterSHA512(bulletin_str)

        SQL = `INSERT INTO BULLETINS (hash, pre_hash, address, sequence, content, quote, file, json, signed_at)
          VALUES ('${hash}', '${bulletin.PreHash}', '${Address}', '${bulletin.Sequence}', '${bulletin.Content}', '${JSON.stringify(bulletin.Quote)}', '${JSON.stringify(bulletin.File)}', '${bulletin_str}', ${bulletin.Timestamp})`
        let result = await runSql(SQL)
        if (result) {
          console.log(`CacheBulletin#${bulletin.Sequence} : ${hash}`)
          CurrentSequence = CurrentSequence + 1
          CurrentPreHash = hash
        } else {
          console.log(`something wrong++++++++++++++++++++++++++++++`)
        }



        // DestDB.run(SQL, err => {
        //   if (err) {
        //     console.log(err)
        //   } else {
        //     let file_list = bulletin.File
        //     if (file_list && file_list.length > 0) {
        //       for (let i = 0; i < file_list.length; i++) {
        //         const file = file_list[i]
        //         SQL = `SELECT * FROM FILES WHERE hash = "${file.Hash}"`
        //         DestDB.get(SQL, (err, item) => {
        //           if (err) {
        //             console.log(err)
        //           } else {
        //             if (item == null) {
        //               let chunk_length = Math.ceil(file.Size / FileChunkSize)
        //               SQL = `INSERT INTO FILES (hash, name, ext, size, chunk_length, chunk_cursor)
        //               VALUES ('${file.Hash}', '${file.Name}', '${file.Ext}', ${file.Size}, ${chunk_length}, 0)`
        //               DestDB.run(SQL, err => {
        //                 if (err) {
        //                   console.log(err)
        //                 } else {
        //                   let msg = genBulletinFileChunkRequest(file.Hash, 1, address)
        //                   sendMessage(msg)
        //                 }
        //               })
        //             }
        //           }
        //         })
        //       }
        //     }
        //   }
        // })
      }

      let end_at = Date.now()
      console.log(`>>>>>>>>>>>>>>>>>>>>>>>Cost Time:`, end_at - begin_at)
    }
  })

}

function init() {
  console.log(`use account: ${Address}`)
  initDestDB()
  gen()
}

init()