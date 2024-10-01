const { ConsoleInfo, ConsoleWarn, ConsoleError, ConsoleDebug, FileHashSync, QuarterSHA512, UniqArray, CheckServerURL } = require('./Util.js')
const { ActionCode, ObjectType, GenDeclare, GenBulletinAddressListRequest, GenBulletinRequest, VerifyJsonSignature, GenBulletinFileChunkRequest, GenObjectResponse, FileChunkSize } = require('./OXO.js')
const { CheckMessageSchema } = require('./Schema.js')

const fs = require('fs')
const Crypto = require('crypto')
const path = require('path')
const sqlite3 = require('sqlite3')
const WebSocket = require('ws')
const oxoKeyPairs = require("oxo-keypairs")

// config
const Servers = [
  {
    URL: "wss://ru.oxo-chat-server.com",
    Address: "ospxTHwV9YJEq5g6h3MZy9ASs8EP3vY4L6"
  }
]
const SelfURL = 'ws://127.0.0.1:8000'

function addServer(address, url) {
  // TODO oxo.txt
  Servers.push({
    URL: url,
    Address: address
  })
  Servers = UniqArray(Servers)
}
// const Seed = "your_seed"
const Seed = oxoKeyPairs.generateSeed("RandomSeed", 'secp256k1')
const keypair = oxoKeyPairs.deriveKeypair(Seed)
const SelfAddress = oxoKeyPairs.deriveAddress(keypair.publicKey)
const SelfPublicKey = keypair.publicKey
const SelfPrivateKey = keypair.privateKey
ConsoleInfo(`use    seed: ${Seed}`)
ConsoleInfo(`use account: ${SelfAddress}`)

// keep alive
process.on('uncaughtException', function (err) {
  // 打印出错误
  ConsoleError(err)
  // 打印出错误的调用栈方便调试
  ConsoleError(err.stack)
})

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
        ConsoleError(err)
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
        ConsoleError(err)
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
        ConsoleError(err)
      }
    })
  })
}

initDB()

// ws
// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
//  Server Connections
let Conns = {}

function fetchConnAddress(ws) {
  for (let address in Conns) {
    if (Conns[address] == ws) {
      return address
    }
  }
  return null
}

function teminateConn(ws) {
  ConsoleInfo(`###################LOG################### client disconnect... <>`)
  ws.close()
  let connAddress = fetchConnAddress(ws)
  if (connAddress != null) {
    ConsoleInfo(`###################LOG################### client disconnect... <${connAddress}>`)
    delete Conns[connAddress]
  }
}

function sendMessage(ws, msg) {
  if (ws != null && ws.readyState == WebSocket.OPEN) {
    ws.send(msg)
  }
}

function pullBulletin(ws) {
  // clone all bulletin from server
  // pull step 1: fetch all account
  let msg = GenBulletinAddressListRequest(1, SelfPublicKey, SelfPrivateKey)
  sendMessage(ws, msg)
}

function pushBulletin(ws) {
  let SQL = `SELECT address, sequence FROM BULLETINS`
  DB.all(SQL, (err, items) => {
    if (err) {
      ConsoleError(err)
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
        let msg = GenBulletinRequest(address, bulletin_sequence[address] + 1, address, SelfPublicKey, SelfPrivateKey)
        sendMessage(ws, msg)
      }
    }
  })
}

function downloadBulletinFile(address) {
  let SQL = `SELECT * FROM FILES WHERE chunk_length != chunk_cursor`
  DB.all(SQL, (err, files) => {
    if (err) {
      ConsoleError(err)
    } else {
      if (files && files.length > 0) {
        ConsoleInfo(`--------------------------files to download--------------------------`)
        ConsoleInfo(files)
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          let msg = GenBulletinFileChunkRequest(file.hash, file.chunk_cursor + 1, address, SelfPublicKey, SelfPrivateKey)
          sendMessage(Conns[address], msg)
        }
      }
    }
  })
}

function bulletinStat() {
  let SQL = `SELECT * FROM BULLETINS`
  DB.all(SQL, (err, items) => {
    if (err) {
      ConsoleError(err)
    } else {
      ConsoleInfo(`BulletinCount: ${items.length}`)
    }
  })

  SQL = `SELECT * FROM FILES`
  DB.all(SQL, (err, items) => {
    if (err) {
      ConsoleError(err)
    } else {
      ConsoleInfo(`****FileCount: ${items.length}`)
    }
  })

  SQL = `SELECT * FROM BULLETINS GROUP BY address`
  DB.all(SQL, (err, items) => {
    if (err) {
      ConsoleError(err)
    } else {
      ConsoleInfo(`*AddressCount: ${items.length}`)
    }
  })
}

// function
function fetchNextBulletin(ws, address) {
  let SQL = `SELECT * FROM BULLETINS WHERE address = "${address}" ORDER BY sequence DESC`
  DB.get(SQL, (err, item) => {
    if (err) {
      ConsoleError(err)
    } else {
      let local_seq = 0
      if (item != null) {
        local_seq = item.sequence
      }
      let msg = GenBulletinRequest(address, local_seq + 1, address, SelfPublicKey, SelfPrivateKey)
      sendMessage(ws, msg)
    }
  })
}

function fetchUnsaveFile(address) {
  let SQL = `SELECT file FROM BULLETINS`
  DB.all(SQL, (err, bulletins) => {
    if (err) {
      ConsoleError(err)
    } else {
      let file_hash_list = []
      bulletins.forEach(bulletin => {
        if (bulletin.file != 'undefined') {
          let file_list = JSON.parse(bulletin.file)
          if (file_list && file_list.length != 0) {
            file_list.forEach(file => {
              file_hash_list.push(file.Hash)
            })
          }
        }
      })
      file_hash_list = UniqArray(file_hash_list)

      SQL = `SELECT * FROM FILES hash IN (${file_hash_list}) AND chunk_length > chunk_cursor`
      DB.all(SQL, (err, files) => {
        if (err) {
          ConsoleError(err)
        } else {
          ConsoleInfo('file_list', files)
          files.forEach(file => {
            let msg = GenBulletinFileChunkRequest(file.hash, file.chunk_cursor + 1, address, SelfPublicKey, SelfPrivateKey)
            Conns[address].send(msg)
          })
        }
      })
    }
  })
}

function CacheBulletin(ws, bulletin) {
  let address = oxoKeyPairs.deriveAddress(bulletin.PublicKey)

  if (VerifyJsonSignature(bulletin)) {
    let timestamp = Date.now()
    let hash = QuarterSHA512(JSON.stringify(bulletin))
    let SQL = `INSERT INTO BULLETINS (hash, pre_hash, address, sequence, content, quote, file, json, signed_at, created_at)
      VALUES ('${hash}', '${bulletin.PreHash}', '${address}', '${bulletin.Sequence}', '${bulletin.Content}', '${JSON.stringify(bulletin.Quote)}', '${JSON.stringify(bulletin.File)}', '${JSON.stringify(bulletin)}', ${bulletin.Timestamp}, ${timestamp})`
    DB.run(SQL, err => {
      if (err) {
        ConsoleError(err)
      } else {
        let file_list = bulletin.File
        if (file_list && file_list.length > 0) {
          for (let i = 0; i < file_list.length; i++) {
            const file = file_list[i]
            SQL = `SELECT * FROM FILES WHERE hash = "${file.Hash}"`
            DB.get(SQL, (err, item) => {
              if (err) {
                ConsoleError(err)
              } else {
                if (item == null) {
                  let chunk_length = Math.ceil(file.Size / FileChunkSize)
                  SQL = `INSERT INTO FILES (hash, name, ext, size, chunk_length, chunk_cursor)
                  VALUES ('${file.Hash}', '${file.Name}', '${file.Ext}', ${file.Size}, ${chunk_length}, 0)`
                  DB.run(SQL, err => {
                    if (err) {
                      ConsoleError(err)
                    } else {
                      let msg = GenBulletinFileChunkRequest(file.Hash, 1, address, SelfPublicKey, SelfPrivateKey)
                      sendMessage(ws, msg)
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
                ConsoleError(err)
              } else {
                if (item == null) {
                  SQL = `INSERT INTO QUOTES (main_hash, quote_hash, address, sequence, content, signed_at)
                    VALUES ('${quote.Hash}', '${hash}', '${address}', ${bulletin.Sequence}, '${bulletin.Content}', ${bulletin.Timestamp})`
                  DB.run(SQL, err => {
                    if (err) {
                      ConsoleError(err)
                    } else {
                    }
                  })

                  SQL = `SELECT * FROM BULLETINS WHERE hash = "${quote.Hash}"`
                  DB.get(SQL, (err, quote_bulletin) => {
                    if (err) {
                      ConsoleError(err)
                    } else {
                      if (quote_bulletin == null) {
                        // 被引用公告未被缓存
                        fetchNextBulletin(ws, quote.Address)
                      }
                    }
                  })
                }
              }
            })
          }
        }

        ConsoleInfo(`CacheBulletin:${address}#${bulletin.Sequence}`)
        let msg = GenBulletinRequest(address, bulletin.Sequence + 1, address, SelfPublicKey, SelfPrivateKey)
        sendMessage(ws, msg)
      }
    })
  } else {
    ConsoleInfo(`bulletin verify failure...:${address}#${bulletin.Sequence}`)
  }
}

function handleMessage(address, json) {
  // ConsoleInfo(json)
  if (json.To != null) {
    // cache bulletin
    if (json.Action == ActionCode.ObjectResponse && json.Object.ObjectType == ObjectType.Bulletin) {
      CacheBulletin(Conns[address], json.Object)
    } else if (json.Action == ActionCode.ObjectResponse && json.Object.ObjectType == ObjectType.BulletinFileChunk) {
      // cache bulletin file
      let SQL = `SELECT * FROM FILES WHERE hash = "${json.Object.Hash}"`
      DB.get(SQL, (err, bulletin_file) => {
        if (err) {
          ConsoleError(err)
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
                  ConsoleError(err)
                } else {
                  ConsoleInfo(`CacheBulletinFile:${json.Object.Hash}#${current_chunk_cursor}/${bulletin_file.chunk_length}`)
                  if (current_chunk_cursor < bulletin_file.chunk_length) {
                    // fetch next file chunk
                    let msg = GenBulletinFileChunkRequest(json.Object.Hash, current_chunk_cursor + 1, address, SelfPublicKey, SelfPrivateKey)
                    sendMessage(Conns[address], msg)
                  } else {
                    // compare hash
                    let hash = FileHashSync(path.resolve(file_path))
                    if (hash != json.Object.Hash) {
                      fs.rmSync(path.resolve(file_path))
                      SQL = `UPDATE FILES SET chunk_cursor = 0 WHERE hash = "${json.Object.Hash}"`
                      DB.run(SQL, err => {
                        if (err) {
                          ConsoleError(err)
                        } else {
                          let msg = GenBulletinFileChunkRequest(json.Object.Hash, 1, address, SelfPublicKey, SelfPrivateKey)
                          sendMessage(Conns[address], msg)
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
  }

  if (json.Action == ActionCode.BulletinRequest) {
    // send cache bulletin
    let SQL = `SELECT * FROM BULLETINS WHERE address = "${json.Address}" AND sequence = "${json.Sequence}"`
    DB.get(SQL, (err, item) => {
      if (err) {
        ConsoleError(err)
      } else {
        ConsoleInfo(`request >>> ${json.Address}#${json.Sequence}`)
        if (item != null) {
          let address = oxoKeyPairs.deriveAddress(json.PublicKey)
          let bulletin_json = JSON.parse(item.json)
          let msg = GenObjectResponse(bulletin_json, address, SelfPublicKey, SelfPrivateKey)
          sendMessage(Conns[address], msg)
          ConsoleInfo(`response <<< ${json.Address}#${json.Sequence}`)
        } else {
          ConsoleInfo(`not found === ${json.Address}#${json.Sequence}`)
          SQL = `SELECT * FROM BULLETINS WHERE address = "${json.Address}" ORDER BY sequence DESC`
          DB.get(SQL, (err, item) => {
            if (err) {
              ConsoleError(err)
            } else {
              let local_seq = 0
              if (item != null) {
                local_seq = item.sequence
              }
              // sync from server
              if (local_seq < json.Sequence - 1) {
                let msg = GenBulletinRequest(SelfAddress, local_seq + 1, SelfAddress, SelfPublicKey, SelfPrivateKey)
                sendMessage(Conns[address], msg)
              }
            }
          })
        }
      }
    })
  } else if (json.To == SelfAddress && json.Action == ActionCode.ObjectResponse && json.Object.ObjectType == ObjectType.Bulletin) {
    CacheBulletin(Conns[address], json.Object)
    // fetch more bulletin
    let msg = GenBulletinRequest(SelfAddress, json.Object.Sequence + 1, SelfAddress, SelfPublicKey, SelfPrivateKey)
    sendMessage(Conns[address], msg)
  } else if (json.Action == ActionCode.BulletinAddressListResponse) {
    let account_list = json.List
    // pull step 2: fetch all account's bulletin
    if (account_list.length > 0) {
      for (let i = 0; i < account_list.length; i++) {
        const account = account_list[i]
        fetchNextBulletin(Conns[address], account.Address)
      }

      let next_page = json.Page + 1
      let msg = GenBulletinAddressListRequest(next_page, SelfPublicKey, SelfPrivateKey)
      sendMessage(Conns[address], msg)
    }
  }
}

function checkMessage(ws, message) {
  // ConsoleInfo(`###################LOG################### Client Message:`)
  // ConsoleInfo(message)
  // ConsoleInfo(`${message.slice(0, 512)}`)
  let json = CheckMessageSchema(message)
  if (json == false) {
    // json格式不合法
    // sendServerMessage(ws, MessageCode.JsonSchemaInvalid)
    ConsoleWarn(`json格式不合法`)
    teminateConn(ws)
  } else {
    if (json.ObjectType == ObjectType.Bulletin) {
      CacheBulletin(ws, json)
      return
    }

    let address = oxoKeyPairs.deriveAddress(json.PublicKey)
    if (Conns[address] == ws) {
      // 连接已经通过"声明消息"校验过签名
      // "声明消息"之外的其他消息，由接收方校验
      // 伪造的"公告消息"无法通过接收方校验，也就无法被接受方看见（进而不能被引用），也就不具备传播能力
      // 伪造的"消息"无法通过接收方校验，也就无法被接受方看见
      // 所以服务器端只校验"声明消息"签名的有效性，并与之建立连接，后续消息无需校验签名，降低服务器运算压力
      handleMessage(address, json)
    } else {
      let connAddress = fetchConnAddress(ws)
      if (connAddress != null && connAddress != address) {
        // using different address in same connection
        // sendServerMessage(ws, MessageCode.AddressChanged)
        teminateConn(ws)
      } else {
        if (!VerifyJsonSignature(json)) {
          // "声明消息"签名不合法
          // sendServerMessage(ws, MessageCode.SignatureInvalid)
          teminateConn(ws)
          return
        }

        if (json.Timestamp + 60000 < Date.now()) {
          // "声明消息"生成时间过早
          // sendServerMessage(ws, MessageCode.TimestampInvalid)
          teminateConn(ws)
          return
        }

        if (connAddress == null && Conns[address] == null) {
          // new connection and new address
          // 当前连接无对应地址，当前地址无对应连接，全新连接
          ConsoleInfo(`connection established from client <${address}>`)
          Conns[address] = ws
          if (json.ActionCode == ActionCode.Declare && CheckServerURL(json.URL)) {
            addServer(address, json.URL)
          }
          // handleMessage(message, json)

          // 获取最新bulletin
          fetchNextBulletin(ws, address)

          // 获取未缓存的bulletin文件
          fetchUnsaveFile(ws)
        } else if (Conns[address] != ws && Conns[address].readyState == WebSocket.OPEN) {
          // new connection kick old conection with same address
          // 当前地址有对应连接，断开旧连接，当前地址对应到当前连接
          // sendServerMessage(Conns[address], MessageCode.NewConnectionOpening)
          Conns[address].close()
          Conns[address] = ws
          // handleMessage(message, json)
        } else {
          ws.send("WTF...")
          teminateConn(ws)
        }
      }
    }
  }
}

function connect(server) {
  ConsoleInfo(`--------------------------connect to server--------------------------`)
  ConsoleInfo(server)
  let ws = new WebSocket(server.URL)
  ws.on('open', function open() {
    ConsoleInfo(`connected <===> ${server.URL}`)
    ws.send(GenDeclare(SelfPublicKey, SelfPrivateKey, SelfURL))
    Conns[server.Address] = ws

    pullBulletin(ws)
    pushBulletin(ws)
    downloadBulletinFile(server.Address)
  })

  ws.on('message', function incoming(buffer) {
    let message = buffer.toString()
    checkMessage(ws, message)
  })

  ws.on('close', function close() {
    ConsoleWarn(`disconnected <=X=> ${server.URL}`)
  })
}

let jobServerConn = null

function keepServerConn() {
  let notConnected = []
  Servers.forEach(server => {
    if (Conns[server.Address] == undefined) {
      notConnected.push(server)
    }
  })

  if (notConnected.length == 0) {
    return
  }

  let random = Math.floor(Math.random() * (notConnected.length))
  let randomServer = notConnected[random]
  if (randomServer != null) {
    connect(randomServer)
  }
}



// client server
let ClientServer = null

function startClientServer() {
  if (ClientServer == null) {
    ClientServer = new WebSocket.Server({
      port: 8000, //to bind on 80, must use "sudo node main.js"
      clientTracking: true,
      maxPayload: 512 * 1024
    })

    ClientServer.on("connection", function connection(ws) {
      ws.on("message", function incoming(message) {
        checkMessage(ws, message)
      })

      ws.on("close", function close() {
        let connAddress = fetchConnAddress(ws)
        if (connAddress != null) {
          ConsoleWarn(`client <${connAddress}> disconnect...`)
          delete Conns[connAddress]
        }
      })
    })
  }
}


function go() {
  bulletinStat()
  startClientServer()

  if (jobServerConn == null) {
    jobServerConn = setInterval(keepServerConn, 8000);
  }
}

go()