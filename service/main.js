const { ConsoleInfo, ConsoleWarn, ConsoleError, ConsoleDebug, FileHashSync, QuarterSHA512, UniqArray, CheckServerURL } = require('./Util.js')
const { ActionCode, ObjectType, GenesisHash, PageSize, GenDeclare, GenBulletinAddressListRequest, GenBulletinAddressListResponse, GenBulletinRequest, VerifyJsonSignature, GenBulletinFileChunkRequest, GenObjectResponse, GenChatSync, GenBulletinReplyListResponse, FileChunkSize, VerifyBulletinJson } = require('./OXO.js')
const { CheckMessageSchema } = require('./Schema.js')

const fs = require('fs')
const path = require('path')
const WebSocket = require('ws')
const oxoKeyPairs = require("oxo-keypairs")
const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()


// config
// standalone server
const SelfURL = "wss://ru.oxo-chat-server.com"
const Seed = "xxJTfMGZPavnqHhcEcHw5ToPCHftw"
const keypair = oxoKeyPairs.deriveKeypair(Seed)
const SelfAddress = oxoKeyPairs.deriveAddress(keypair.publicKey)
const SelfPublicKey = keypair.publicKey
const SelfPrivateKey = keypair.privateKey

const Servers = [
  // {
  //   URL: "wss://ru.oxo-chat-server.com",
  //   Address: "ospxTHwV9YJEq5g6h3MZy9ASs8EP3vY4L6"
  // }
]

//keep alive
process.on("uncaughtException", function (err) {
  //打印出错误
  ConsoleError(err)
  //打印出错误的调用栈方便调试
  ConsoleError(err.stack)
})

async function DelayExec(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

// function sendServerMessage(ws, msgCode) {
//   ws.send(strServerMessage(msgCode))
// }

//client connection
let Conns = {}

function fetchConnAddress(ws) {
  for (let address in Conns) {
    if (Conns[address] == ws) {
      return address
    }
  }
  return null
}



//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
//client listener
function teminateConn(ws) {
  ws.close()
  let connAddress = fetchConnAddress(ws)
  if (connAddress != null) {
    ConsoleWarn(`###################LOG################### client disconnect... <${connAddress}>`)
    delete Conns[connAddress]
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

async function CacheBulletin(bulletin) {
  let timestamp = Date.now()
  let hash = QuarterSHA512(JSON.stringify(bulletin))
  let address = oxoKeyPairs.deriveAddress(bulletin.PublicKey)

  let b = await prisma.BULLETINS.findFirst({
    where: {
      hash: hash
    }
  })
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
          let msg = GenBulletinFileChunkRequest(f.hash, f.chunk_cursor + 1, address, SelfPublicKey, SelfPrivateKey)
          Conns[address].send(msg)
        }
      })

      //Brocdcast to OtherServer
      for (let i in OtherServer) {
        let ws = Conns[OtherServer[i].Address]
        if (ws != undefined && ws.readyState == WebSocket.OPEN) {
          ws.send(GenObjectResponse(bulletin, OtherServer[i].Address, SelfPublicKey, SelfPrivateKey))
        }
      }
    }
  }
}

async function CacheECDH(json) {
  let address1 = ""
  let address2 = ""
  let json1 = ""
  let json2 = ""
  let sour_address = oxoKeyPairs.deriveAddress(json.PublicKey)
  let dest_address = json.To
  if (sour_address > dest_address) {
    address1 = sour_address
    address2 = dest_address
    json1 = JSON.stringify(json)
  } else {
    address1 = dest_address
    address2 = sour_address
    json2 = JSON.stringify(json)
  }

  let dh = await prisma.ECDHS.findFirst({
    where: {
      address1: address1,
      address2: address2,
      partition: json.Partition,
      sequence: json.Sequence
    }
  })
  if (dh == null) {
    if (json1 != "") {
      await prisma.ECDHS.create({
        data: {
          address1: address1,
          address2: address2,
          partition: json.Partition,
          sequence: json.Sequence,
          json1: json1,
          json2: ""
        }
      })
    } else if (json2 != "") {
      await prisma.ECDHS.create({
        data: {
          address1: address1,
          address2: address2,
          partition: json.Partition,
          sequence: json.Sequence,
          json1: "",
          json2: json2
        }
      })
    }
  } else {
    if (json1 != "") {
      await prisma.ECDHS.update({
        where: {
          address1_address2_partition_sequence: {
            address1: address1,
            address2: address2,
            partition: json.Partition,
            sequence: json.Sequence
          }
        },
        data: {
          json1: json1
        }
      })
    } else if (json2 != "") {
      await prisma.ECDHS.update({
        where: {
          address1_address2_partition_sequence: {
            address1: address1,
            address2: address2,
            partition: json.Partition,
            sequence: json.Sequence
          }
        },
        data: {
          json2: json2
        }
      })
    }
  }
}

async function HandelECDHSync(json) {
  let address1 = ""
  let address2 = ""
  let sour_address = oxoKeyPairs.deriveAddress(json.PublicKey)
  let dest_address = json.To
  if (sour_address > dest_address) {
    address1 = sour_address
    address2 = dest_address
  } else {
    address1 = dest_address
    address2 = sour_address
  }

  let dh = await prisma.ECDHS.findFirst({
    where: {
      address1: address1,
      address2: address2,
      partition: json.Partition,
      sequence: json.Sequence
    },
    select: {
      json1: true,
      json2: true
    }
  })
  if (dh != null && json.Pair == "") {
    // dh存在 对方握手消息已记录
    // 我未完成握手
    if (address1 == sour_address && dh.json2 != "") {
      Conns[sour_address].send(`${dh.json2}`)
    } else if (address2 == sour_address && dh.json1 != "") {
      Conns[sour_address].send(`${dh.json1}`)
    }
  }
}

async function CacheMessage(json) {
  let str_json = JSON.stringify(json)
  let hash = QuarterSHA512(str_json)
  let sour_address = oxoKeyPairs.deriveAddress(json.PublicKey)
  let dest_address = json.To
  let msg_list = await prisma.MESSAGES.findMany({
    where: {
      sour_address: sour_address,
      dest_address: dest_address,
      sequence: {
        lt: json.Sequence
      }
    },
    orderBy: {
      sequence: "asc"
    },
    select: {
      sequence: true,
      hash: true
    }
  })
  let msg_list_length = msg_list.length
  if ((msg_list_length == 0 && json.Sequence == 1 && json.PreHash == GenesisHash) || (msg_list_length != 0 && msg_list_length == msg_list[msg_list_length - 1].sequence && json.Sequence == msg_list_length + 1 && json.PreHash == msg_list[msg_list_length - 1].hash)) {
    await prisma.MESSAGES.create({
      data: {
        hash: hash,
        sour_address: sour_address,
        dest_address: dest_address,
        sequence: json.Sequence,
        signed_at: json.Timestamp,
        json: str_json
      }
    })
  } else {
    let current_sequence = 0
    if (msg_list_length != 0) {
      current_sequence = msg_list_length
    }
    let msg = GenChatSync(dest_address, current_sequence)
    Conns[sour_address].send(`${msg}`)
  }
}

async function HandelChatSync(json) {
  let dest_address = oxoKeyPairs.deriveAddress(json.PublicKey)
  let msg_list = await prisma.MESSAGES.findMany({
    where: {
      sour_address: json.To,
      dest_address: dest_address,
      sequence: {
        gt: json.CurrentSequence
      }
    },
    select: {
      json: true
    },
    orderBy: {
      sequence: "asc"
    }
  })
  let msg_list_length = msg_list.length
  for (let i = 0; i < msg_list_length; i++) {
    await DelayExec(1000)
    Conns[dest_address].send(`${msg_list[i].json}`)
  }
}

async function handleMessage(message, json) {
  if (json.To != null) {
    if (Conns[json.To] != null && Conns[json.To].readyState == WebSocket.OPEN) {
      // 對方在綫
      //forward message
      Conns[json.To].send(`${message}`)
    }

    if (json.Action == ActionCode.ChatMessage) {
      CacheMessage(json)
    } else if (json.Action == ActionCode.ChatSync) {
      HandelChatSync(json)
    } else if (json.Action == ActionCode.ChatDH) {
      CacheECDH(json)
      HandelECDHSync(json)
    }

    if (json.Action == ActionCode.ObjectResponse) {
      if (json.Object.ObjectType == ObjectType.Bulletin) {
        //cache bulletin
        CacheBulletin(json.Object)
        if (json.To == SelfAddress) {
          //fetch more bulletin
          let address = oxoKeyPairs.deriveAddress(json.Object.PublicKey)
          if (Conns[address] != null && Conns[address].readyState == WebSocket.OPEN) {
            let msg = GenBulletinRequest(address, json.Object.Sequence + 1, address, SelfPublicKey, SelfPrivateKey)
            Conns[address].send(msg)
          }
        }
      } else if (json.Object.ObjectType == ObjectType.BulletinFileChunk) {
        //cache bulletin file
        ConsoleInfo(`BulletinFileChunk........................................`)
        let bulletin_file = await prisma.FILES.findFirst({
          where: {
            hash: json.Object.Hash
          },
          select: {
            size: true,
            chunk_length: true,
            chunk_cursor: true
          }
        })
        let file_dir = `./BulletinFile/${json.Object.Hash.substring(0, 3)}/${json.Object.Hash.substring(3, 6)}`
        let file_path = `${file_dir}/${json.Object.Hash}`
        fs.mkdirSync(path.resolve(file_dir), { recursive: true })
        if (bulletin_file.chunk_cursor < bulletin_file.chunk_length) {
          const utf8_buffer = Buffer.from(json.Object.Content, 'base64')
          fs.appendFileSync(path.resolve(file_path), utf8_buffer)
          let current_chunk_cursor = bulletin_file.chunk_cursor + 1
          await prisma.FILES.update({
            where: {
              hash: json.Object.Hash
            },
            data: {
              chunk_cursor: current_chunk_cursor
            }
          })
          if (current_chunk_cursor < bulletin_file.chunk_length) {
            let address = oxoKeyPairs.deriveAddress(json.PublicKey)
            let msg = GenBulletinFileChunkRequest(json.Object.Hash, current_chunk_cursor + 1, address, SelfPublicKey, SelfPrivateKey)
            Conns[address].send(msg)
          } else {
            // compare hash
            let hash = FileHashSync(path.resolve(file_path))
            if (hash != json.Object.Hash) {
              fs.rmSync(path.resolve(file_path))
              await prisma.FILES.update({
                where: {
                  hash: json.Object.Hash
                },
                data: {
                  chunk_cursor: 0
                }
              })
            }
          }
        }
      }
    }
  }

  if (json.Action == ActionCode.BulletinRequest) {
    //send cache bulletin
    let bulletin = await prisma.BULLETINS.findFirst({
      where: {
        address: json.Address,
        sequence: json.Sequence
      },
      select: {
        json: true
      }
    })
    if (bulletin != null) {
      let address = oxoKeyPairs.deriveAddress(json.PublicKey)
      Conns[address].send(bulletin.json)
    }
  } else if (json.Action == ActionCode.BulletinFileChunkRequest) {
    let file = await prisma.FILES.findFirst({
      where: {
        hash: json.Hash
      },
      select: {
        size: true,
        chunk_cursor: true,
        chunk_length: true
      }
    })
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
        let object = GenBulletinFileChunkJson(json.Hash, json.Cursor, content, SelfPublicKey, SelfPrivateKey)
        let msg = GenObjectResponse(object, address, SelfPublicKey, SelfPrivateKey)
        Conns[address].send(msg)
      } else if (json.To != "" && Conns[json.To]) {
        // fetch file
        let msg = GenBulletinFileChunkRequest(json.Hash, file.chunk_cursor + 1, json.To, SelfPublicKey, SelfPrivateKey)
        Conns[json.To].send(msg)
      }
    }
  } else if (json.Action == ActionCode.BulletinRandom) {
    //send random bulletin
    let bulletin = await prisma.$queryRaw`SELECT * FROM "public"."BULLETINS" ORDER BY RANDOM() LIMIT 1`
    if (bulletin != null) {
      let address = oxoKeyPairs.deriveAddress(json.PublicKey)
      Conns[address].send(bulletin[0].json)
    }
  } else if (json.Action == ActionCode.BulletinAddressListRequest && json.Page > 0) {
    let address = oxoKeyPairs.deriveAddress(json.PublicKey)
    let result = await prisma.BULLETINS.groupBy({
      by: "address",
      _count: {
        address: true,
      },
      orderBy: {
        _count: {
          address: "desc",
        },
      },
      skip: (json.Page - 1) * PageSize,
      take: PageSize,
    })
    let address_list = []
    result.forEach(item => {
      let new_item = {}
      new_item.Address = item.address
      new_item.Count = item._count.address
      address_list.push(new_item)
    })
    let msg = GenBulletinAddressListResponse(json.Page, address_list, SelfPublicKey, SelfPrivateKey)
    Conns[address].send(msg)
  } else if (json.Action == ActionCode.BulletinReplyListRequest && json.Page > 0) {
    let address = oxoKeyPairs.deriveAddress(json.PublicKey)
    let result = await prisma.QUOTES.findMany({
      where: {
        main_hash: json.Hash
      },
      select: {
        quote_hash: true,
        address: true,
        sequence: true,
        content: true,
        signed_at: true
      },
      skip: (json.Page - 1) * PageSize,
      take: PageSize,
      orderBy: {
        signed_at: "desc"
      }
    })
    let reply_list = []
    result.forEach(item => {
      let new_item = {}
      new_item.Address = item.address
      new_item.Sequence = item.sequence
      new_item.Hash = item.quote_hash
      new_item.Content = item.content
      new_item.Timestamp = Number(item.signed_at)
      reply_list.push(new_item)
    })
    let msg = GenBulletinReplyListResponse(json.Hash, json.Page, reply_list)
    Conns[address].send(msg)
  }
}

async function checkMessage(ws, message) {
  ConsoleInfo(`###################LOG################### Client Message:`)
  ConsoleInfo(`${message.slice(0, 512)}`)
  let json = CheckMessageSchema(message)
  if (json == false) {
    //json格式不合法
    // sendServerMessage(ws, MessageCode.JsonSchemaInvalid)
    ConsoleWarn(`json格式不合法`)
    teminateConn(ws)
  } else {
    let address = oxoKeyPairs.deriveAddress(json.PublicKey)
    if (Conns[address] == ws) {
      // 连接已经通过"声明消息"校验过签名
      // "声明消息"之外的其他消息，由接收方校验
      // 伪造的"公告消息"无法通过接收方校验，也就无法被接受方看见（进而不能被引用），也就不具备传播能力
      // 伪造的"消息"无法通过接收方校验，也就无法被接受方看见
      // 所以服务器端只校验"声明消息"签名的有效性，并与之建立连接，后续消息无需校验签名，降低服务器运算压力
      handleMessage(message, json)
    } else {
      let connAddress = fetchConnAddress(ws)
      if (connAddress != null && connAddress != address) {
        //using different address in same connection
        // sendServerMessage(ws, MessageCode.AddressChanged)
        teminateConn(ws)
      } else {
        if (!VerifyJsonSignature(json)) {
          //"声明消息"签名不合法
          // sendServerMessage(ws, MessageCode.SignatureInvalid)
          teminateConn(ws)
          return
        }

        if (json.Timestamp + 60000 < Date.now()) {
          //"声明消息"生成时间过早
          // sendServerMessage(ws, MessageCode.TimestampInvalid)
          teminateConn(ws)
          return
        }

        if (connAddress == null && Conns[address] == null) {
          //new connection and new address
          //当前连接无对应地址，当前地址无对应连接，全新连接
          ConsoleInfo(`connection established from client <${address}>`)
          Conns[address] = ws
          //handleMessage(message, json)
          if (json.URL != null) {
            Conns[address].send(GenDeclare(SelfPublicKey, SelfPrivateKey, SelfURL))
          }

          // 获取最新bulletin
          let bulletin = await prisma.BULLETINS.findFirst({
            where: {
              address: address
            },
            orderBy: {
              sequence: "desc"
            },
            select: {
              sequence: true
            }
          })
          let sequence = 1
          if (bulletin != null) {
            sequence = bulletin.sequence + 1
          }
          let msg = GenBulletinRequest(address, sequence, address, SelfPublicKey, SelfPrivateKey)
          Conns[address].send(msg)

          // 获取未缓存的bulletin文件
          let bulletin_list = await prisma.BULLETINS.findMany({
            orderBy: {
              sequence: "desc"
            }
          })
          let file_hash_list = []
          bulletin_list.forEach(async bulletin => {
            let file_list = JSON.parse(bulletin.file)
            if (file_list && file_list.length != 0) {
              file_list.forEach(async file => {
                file_hash_list.push(file.Hash)
              })
            }
          })
          file_hash_list = UniqArray(file_hash_list)
          let file_list = await prisma.FILES.findMany({
            where: {
              AND: {
                hash: {
                  in: file_hash_list
                },
                chunk_length: {
                  gt: prisma.FILES.fields.chunk_cursor
                }
              }
            }
          })
          ConsoleInfo('file_list', file_list)
          file_list.forEach(async file => {
            if (file.chunk_cursor < file.chunk_length) {
              let msg = GenBulletinFileChunkRequest(file.hash, file.chunk_cursor + 1, address, SelfPublicKey, SelfPrivateKey)
              Conns[address].send(msg)
            }
          })
        } else if (Conns[address] != ws && Conns[address].readyState == WebSocket.OPEN) {
          //new connection kick old conection with same address
          //当前地址有对应连接，断开旧连接，当前地址对应到当前连接
          // sendServerMessage(Conns[address], MessageCode.NewConnectionOpening)
          Conns[address].close()
          Conns[address] = ws
          //handleMessage(message, json)
        } else {
          ws.send("WTF...")
          teminateConn(ws)
        }
      }
    }
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
      ws.on("message", function incoming(buffer) {
        let message = buffer.toString()
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

function go() {
  bulletinStat()
  startClientServer()

  if (jobServerConn == null) {
    jobServerConn = setInterval(keepServerConn, 8000)
  }
}

go()

// 刷新数据关联
// async function refreshData() {
//   //update pre_bulletin's next_hash
//   let bulletin_list = await prisma.BULLETINS.findMany({
//     orderBy: {
//       sequence: "desc"
//     }
//   })
//   for (let i = 0; i < bulletin_list.length; i++) {
//     const bulletin = bulletin_list[i]
//     if (bulletin.sequence != 1) {
//       await prisma.BULLETINS.update({
//         where: {
//           hash: bulletin.pre_hash
//         },
//         data: {
//           next_hash: bulletin.hash
//         }
//       })
//     }
//   }

//   //linking quote
//   bulletin_list.forEach(async bulletin => {
//     if (bulletin.quote) {
//       let quote_list = JSON.parse(bulletin.quote)
//       if (quote_list.length != 0) {
//         quote_list.forEach(async quote => {
//           let result = await prisma.QUOTES.findFirst({
//             where: {
//               main_hash: quote.Hash,
//               quote_hash: bulletin.hash
//             }
//           })
//           if (!result) {
//             result = await prisma.QUOTES.create({
//               data: {
//                 main_hash: quote.Hash,
//                 quote_hash: bulletin.hash,
//                 address: bulletin.address,
//                 sequence: bulletin.sequence,
//                 content: bulletin.content,
//                 signed_at: bulletin.signed_at
//               }
//             })
//             if (result) {
//               console.log(`linking`, quote)
//             }
//           }
//         })
//       }
//     }
//   })

//   //linking file
//   console.log(`**************************************linking file`)
//   bulletin_list.forEach(async bulletin => {
//     if (bulletin.file) {
//       let file_list = JSON.parse(bulletin.file)
//       // console.log(file_list)
//       if (file_list.length != 0) {
//         file_list.forEach(async file => {
//           console.log(file)
//           let result = await prisma.FILES.findFirst({
//             where: {
//               hash: file.Hash
//             }
//           })

//           if (!result) {
//             console.log(`resultooooooooooooooooooooooooooooooooooooooooooooo`)
//             console.log(result)
//             let chunk_length = Math.ceil(file.Size / FileChunkSize)
//             result = await prisma.FILES.create({
//               data: {
//                 hash: file.Hash,
//                 name: file.Name,
//                 ext: file.Ext,
//                 size: file.Size,
//                 chunk_length: chunk_length,
//                 chunk_cursor: 0
//               }
//             })
//             console.log(`linking`, file)
//           }
//         })
//       }
//     }
//   })

// }
// refreshData()

fs.mkdirSync(path.resolve('./BulletinFile'), { recursive: true })