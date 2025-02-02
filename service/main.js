const fs = require('fs')
const path = require('path')
const WebSocket = require('ws')
const oxoKeyPairs = require("oxo-keypairs")
const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

const { ConsoleInfo, ConsoleWarn, ConsoleError, ConsoleDebug, DelayExec, FileHashSync, QuarterSHA512, UniqArray, CheckServerURL } = require('./util.js')
const { ActionCode, ObjectType, GenesisHash, PageSize, FileChunkSize } = require('./oxo_const.js')
const { VerifyJsonSignature, VerifyBulletinJson, VerifyObjectResponseJson } = require('./oxo_util.js')
const { GenDeclare, GenBulletinAddressListRequest, GenBulletinAddressListResponse, GenBulletinRequest, GenBulletinFileChunkRequest, GenObjectResponse, GenChatMessageSync, GenBulletinReplyListResponse, GenBulletinFileChunkJson } = require('./msg_generator.js')
const { MsgValidate } = require('./msg_validator.js')

// config
const ConfigPath = './config.json'
// config_json =
// {
//   "SelfURL": "wss://ru.oxo-chat-server.com",
//   "Seed": "xxJTfMGZPavnqHhcEcHw5ToPCHftw",
//   "NodeList": [
//     {
//       "URL": "wss://ru.oxo-chat-server.com",
//       "Address": "ospxTHwV9YJEq5g6h3MZy9ASs8EP3vY4L6"
//     }
//   ]
// }
let SelfURL = undefined
let SelfAddress
let SelfPublicKey
let SelfPrivateKey

let NodeList = []
// client server daemon
let ServerDaemon = null
//client and node connection
let Conns = {}
// node conn
let jobNodeConn = null
let jobNodeSync = null

// keep alive
process.on("uncaughtException", function (err) {
  //打印出错误
  ConsoleError(err)
  //打印出错误的调用栈方便调试
  ConsoleError(err.stack)
})

// TODO: server msg
// function sendServerMessage(ws, msgCode) {
//   ws.send(strServerMessage(msgCode))
// }

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

function pullBulletin(to) {
  // clone all bulletin from server
  // pull step 1: fetch all account
  let msg = GenBulletinAddressListRequest(1, SelfPublicKey, SelfPrivateKey)
  SendMessage(to, msg)
}

async function pushBulletin(to) {
  let bulletin_list = await prisma.BULLETINS.findMany({
    select: {
      address: true,
      sequence: true
    }
  })
  let bulletin_sequence = {}
  bulletin_list.forEach(bulletin => {
    if (bulletin_sequence[bulletin.address] == null) {
      bulletin_sequence[bulletin.address] = bulletin.sequence
    } else if (bulletin_sequence[bulletin.address] < bulletin.sequence) {
      bulletin_sequence[bulletin.address] = bulletin.sequence
    }
  })

  for (const address in bulletin_sequence) {
    await DelayExec(1000)
    let msg = GenBulletinRequest(address, bulletin_sequence[address] + 1, address, SelfPublicKey, SelfPrivateKey)
    SendMessage(to, msg)
  }
}

async function downloadBulletinFile(address) {
  let file_list = await prisma.FILES.findMany({
    where: {
      NOT: [
        {
          chunk_length: {
            equals: prisma.FILES.fields.chunk_cursor
          }
        }
      ]
    }
  })
  if (file_list && file_list.length > 0) {
    ConsoleInfo(`--------------------------files to download--------------------------`)
    ConsoleInfo(file_list)
    for (let i = 0; i < file_list.length; i++) {
      const file = file_list[i]
      let msg = GenBulletinFileChunkRequest(file.hash, file.chunk_cursor + 1, address, SelfPublicKey, SelfPrivateKey)
      SendMessage(Conns[address], msg)
    }
  }
}

async function CacheBulletin(from, bulletin) {
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

    if (result) {
      if (result.sequence != 1) {
        //update pre_bulletin's next_hash
        result = await prisma.BULLETINS.update({
          where: {
            hash: bulletin.PreHash
          },
          data: {
            next_hash: hash
          }
        })
      }

      //create quote
      if (bulletin.Quote) {
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
      }


      //create file
      if (bulletin.File) {
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
            SendMessage(from, msg)
          }
        })
      }

      //Brocdcast to NodeList
      for (let i in NodeList) {
        let msg = GenObjectResponse(bulletin, NodeList[i].Address, SelfPublicKey, SelfPrivateKey)
        SendMessage(NodeList[i].Address, msg)
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
      if (dh.json1 != "") {
        let old_json1 = JSON.parse(dh.json1)
        if (json.Timestamp >= old_json1.Timestamp) {
          return
        }
      }
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
      if (dh.json2 != "") {
        let old_json2 = JSON.parse(dh.json2)
        if (json.Timestamp >= old_json2.Timestamp) {
          return
        }
      }
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
      SendMessage(sour_address, dh.json2)
    } else if (address2 == sour_address && dh.json1 != "") {
      SendMessage(sour_address, dh.json1)
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
    let msg = GenChatMessageSync(dest_address, current_sequence, SelfPublicKey, SelfPrivateKey)
    SendMessage(sour_address, msg)
  }
}

async function HandelChatMessageSync(json) {
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
    SendMessage(dest_address, msg_list[i].json)
  }
}

function SendMessage(address, message) {
  if (Conns[address] != null && Conns[address].readyState == WebSocket.OPEN) {
    // 對方在綫
    Conns[address].send(`${message}`)
  }
}

async function handleObject(from, message, json) {
  if (json.To != null) {
    // forward message
    SendMessage(json.To, message)
  }

  if (json.ObjectType == ObjectType.Bulletin && VerifyBulletinJson(json)) {
    CacheBulletin(from, json)
    //fetch more bulletin
    let address = oxoKeyPairs.deriveAddress(json.PublicKey)
    let msg = GenBulletinRequest(address, json.Sequence + 1, address, SelfPublicKey, SelfPrivateKey)
    SendMessage(from, msg)
  } else if (json.ObjectType == ObjectType.ChatMessage && VerifyJsonSignature(json)) {
    CacheMessage(json)
  } else if (json.ObjectType == ObjectType.ChatDH && VerifyJsonSignature(json)) {
    CacheECDH(json)
    HandelECDHSync(json)
  }
}

async function handleMessage(from, message, json) {
  if (json.To != null) {
    // forward message
    SendMessage(json.To, message)
  }

  if (json.Action === ActionCode.BulletinRequest) {
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
      SendMessage(address, bulletin.json)
    }
  } else if (json.Action === ActionCode.BulletinFileChunkRequest) {
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
        let object = GenBulletinFileChunkJson(json.Hash, json.Cursor, content)
        let msg = GenObjectResponse(object, address, SelfPublicKey, SelfPrivateKey)
        SendMessage(address, msg)
      } else if (json.To != "" && Conns[json.To]) {
        // fetch file
        let msg = GenBulletinFileChunkRequest(json.Hash, file.chunk_cursor + 1, json.To, SelfPublicKey, SelfPrivateKey)
        SendMessage(json.To, msg)
      }
    }
  } else if (json.Action === ActionCode.BulletinRandomRequest) {
    //send random bulletin
    let bulletins = await prisma.$queryRaw`SELECT * FROM "public"."BULLETINS" ORDER BY RANDOM() LIMIT 1`
    if (bulletins != null && bulletins.length != 0) {
      let address = oxoKeyPairs.deriveAddress(json.PublicKey)
      SendMessage(address, bulletins[0].json)
    }
  } else if (json.Action === ActionCode.BulletinAddressListRequest && json.Page > 0) {
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
    if (address_list.length > 0) {
      let msg = GenBulletinAddressListResponse(json.Page, address_list, SelfPublicKey, SelfPrivateKey)
      SendMessage(address, msg)
    }
  } else if (json.Action === ActionCode.BulletinAddressListResponse) {
    // pull step 2: fetch account latest bulletin
    let items = json.List
    for (let i = 0; i < items.length; i++) {
      await DelayExec(1000)
      const item = items[i]
      let bulletin = await prisma.BULLETINS.findFirst({
        where: {
          address: item.Address
        },
        select: {
          sequence: true
        },
        orderBy: {
          sequence: "desc"
        }
      })
      let next_sequence = 1
      if (bulletin) {
        next_sequence = bulletin.sequence + 1
        if (bulletin.sequence < item.Count) {
          let bulletin_req = GenBulletinRequest(item.Address, next_sequence, from, SelfPublicKey, SelfPrivateKey)
          SendMessage(from, bulletin_req)
        } else if (bulletin.sequence > item.Count) {
          bulletin = await prisma.BULLETINS.findFirst({
            where: {
              AND: {
                address: item.Address,
                sequence: item.Count + 1
              }
            },
            select: {
              json: true
            }
          })
          if (bulletin) {
            SendMessage(from, bulletin.json)
          }
        }
      } else {
        let bulletin_req = GenBulletinRequest(item.Address, next_sequence, from, SelfPublicKey, SelfPrivateKey)
        SendMessage(from, bulletin_req)
      }
    }
    let msg = GenBulletinAddressListRequest(json.Page + 1, SelfPublicKey, SelfPrivateKey)
    SendMessage(from, msg)
  } else if (json.Action === ActionCode.BulletinReplyListRequest && json.Page > 0) {
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
    if (reply_list.length > 0) {
      let msg = GenBulletinReplyListResponse(json.Hash, json.Page, reply_list)
      SendMessage(address, msg)
    }
  } else if (json.Action === ActionCode.ChatMessageSync) {
    HandelChatMessageSync(json)
  } else if (json.Action === ActionCode.ObjectResponse && VerifyObjectResponseJson(json)) {
    if (json.Object.ObjectType == ObjectType.Bulletin && VerifyBulletinJson(json.Object)) {
      CacheBulletin(from, json.Object)
      if (json.To == SelfAddress) {
        //fetch more bulletin
        let address = oxoKeyPairs.deriveAddress(json.Object.PublicKey)
        let msg = GenBulletinRequest(address, json.Object.Sequence + 1, address, SelfPublicKey, SelfPrivateKey)
        SendMessage(address, msg)
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
          SendMessage(address, msg)
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
    } else if (json.Object.ObjectType == ObjectType.ChatFileChunk) {

    }
  }
}

async function SyncClient(address) {
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
  SendMessage(address, msg)

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

  file_list.forEach(async file => {
    if (file.chunk_cursor < file.chunk_length) {
      let msg = GenBulletinFileChunkRequest(file.hash, file.chunk_cursor + 1, address, SelfPublicKey, SelfPrivateKey)
      SendMessage(address, msg)
    }
  })

  // 获取未配对私聊请求
  let dh = await prisma.ECDHS.findFirst({
    where: {
      OR: [
        {
          address1: address,
          json1: ""
        },
        {
          address2: address,
          json2: ""
        }
      ]
    }
  })
  if (dh != null) {
    if (dh.json1 == "") {
      SendMessage(address, dh.json2)
    } else if (dh.json2 == "") {
      SendMessage(address, dh.json1)
    }
  }
}

async function checkMessage(ws, message) {
  ConsoleInfo(`###################LOG################### Client Message:`)
  ConsoleInfo(`${message}`)
  // ConsoleInfo(`${message.slice(0, 512)}`)
  let json = MsgValidate(message)
  if (json == false) {
    // json格式不合法
    // sendServerMessage(ws, MessageCode.JsonSchemaInvalid)
    ConsoleWarn(`json schema invalid...`)
    teminateConn(ws)
  } else if (json.ObjectType) {
    // ConsoleDebug(`checkMessage:${0}`)
    let connAddress = fetchConnAddress(ws)
    handleObject(connAddress, message, json)
  } else if (json.Action) {
    // ConsoleDebug(`checkMessage:${1}`)
    let address = oxoKeyPairs.deriveAddress(json.PublicKey)
    if (Conns[address] == ws) {
      // ConsoleDebug(`checkMessage:${2}`)
      // 连接已经通过"声明消息"校验过签名
      // "声明消息"之外的其他消息，由接收方校验
      // 伪造的"公告消息"无法通过接收方校验，也就无法被接受方看见（进而不能被引用），也就不具备传播能力
      // 伪造的"消息"无法通过接收方校验，也就无法被接受方看见
      // 所以服务器端只校验"声明消息"签名的有效性，并与之建立连接，后续消息无需校验签名，降低服务器运算压力
      handleMessage(address, message, json)
    } else {
      // ConsoleDebug(`checkMessage:${3}`)
      let connAddress = fetchConnAddress(ws)
      // ConsoleDebug(`checkMessage:${address}`)
      // ConsoleDebug(`checkMessage:${connAddress}`)
      if (connAddress != null && connAddress != address) {
        // using different address in same connection
        // sendServerMessage(ws, MessageCode.AddressChanged)
      } else {
        // ConsoleDebug(`checkMessage:${4}`)
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

        if (connAddress == null && Conns[address] == null && json.Action === ActionCode.Declare) {
          // new connection and new address
          // 当前连接无对应地址，当前地址无对应连接，全新连接，接受客户端声明
          ConsoleWarn(`connected <===> client : <${address}>`)
          Conns[address] = ws
          if (json.URL != null && CheckServerURL(json.URL)) {
            // Server Conntion
            NodeList.push({
              URL: json.URL,
              Address: address
            })
            NodeList = UniqArray(NodeList)
            let msg = GenDeclare(SelfPublicKey, SelfPrivateKey, SelfURL)
            SendMessage(address, msg)
          }

          SyncClient(address)
        } else if (Conns[address] && Conns[address] != ws && Conns[address].readyState == WebSocket.OPEN) {
          // ConsoleDebug(`checkMessage:${5}`)
          // new connection kick old conection with same address
          // 当前地址有对应连接，断开旧连接，当前地址对应到当前连接
          // sendServerMessage(Conns[address], MessageCode.NewConnectionOpening)
          Conns[address].close()
          Conns[address] = ws
        } else {
          ws.send("WTF...")
          teminateConn(ws)
        }
      }
    }
  }
}

// 同步节点Bulletin数据
function SyncNode(address) {
  pullBulletin(address)
  pushBulletin(address)
  downloadBulletinFile(address)
}

// 启动服务器守望进程
function startServerDaemon() {
  if (ServerDaemon == null) {
    ServerDaemon = new WebSocket.Server({
      port: 8000, //to bind on 80, must use "sudo node main.js"
      clientTracking: true,
      maxPayload: 512 * 1024
    })

    ServerDaemon.on("connection", function connection(ws) {
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

// 连接指定外部节点
function connectNode(node) {
  ConsoleInfo(`--------------------------connect to node--------------------------`)
  ConsoleWarn(node)
  let ws = new WebSocket(node.URL)
  ws.on('open', function open() {
    ConsoleWarn(`connected <===> ${node.URL}`)
    ws.send(GenDeclare(SelfPublicKey, SelfPrivateKey, SelfURL))
    Conns[node.Address] = ws

    SyncNode(node.Address)
  })

  ws.on('message', function incoming(buffer) {
    let message = buffer.toString()
    checkMessage(ws, message)
  })

  ws.on('close', function close() {
    ConsoleWarn(`disconnected <=X=> ${node.URL}`)
    teminateConn(ws)
  })
}

// 尝试连接外部节点（随机选择1个未建立连接的节点）
function keepNodeConn() {
  let notConnected = []
  NodeList.forEach(node => {
    if (Conns[node.Address] == undefined) {
      notConnected.push(node)
    }
  })

  if (notConnected.length == 0) {
    return
  }
  ConsoleWarn(`--------------------------keepNodeConn--------------------------`)

  let random = Math.floor(Math.random() * (notConnected.length))
  let randomNode = notConnected[random]
  if (randomNode != null) {
    connectNode(randomNode)
  }
}

function keepNodeSync() {
  ConsoleWarn(`--------------------------keepNodeSync--------------------------`)
  NodeList.forEach(node => {
    if (Conns[node.Address]) {
      SyncNode(node.Address)
    }
  })
}

// 打印bulletin统计信息
async function bulletinStat() {
  let bulletin_list = await prisma.BULLETINS.findMany()
  ConsoleWarn(`BulletinCount: ${bulletin_list.length}`)

  let file_list = await prisma.FILES.findMany()
  ConsoleWarn(`****FileCount: ${file_list.length}`)

  let address_list = await prisma.BULLETINS.groupBy({
    by: "address"
  })
  ConsoleWarn(`*AddressCount: ${address_list.length}`)
}

// 刷新数据关联
async function refreshData() {
  // update pre_bulletin's next_hash
  let bulletin_list = await prisma.BULLETINS.findMany({
    orderBy: {
      sequence: "desc"
    }
  })
  for (let i = 0; i < bulletin_list.length; i++) {
    const bulletin = bulletin_list[i]
    if (bulletin.sequence != 1) {
      await prisma.BULLETINS.update({
        where: {
          hash: bulletin.pre_hash
        },
        data: {
          next_hash: bulletin.hash
        }
      })
    }
  }

  // linking quote
  bulletin_list.forEach(async bulletin => {
    if (bulletin.quote) {
      let quote_list = JSON.parse(bulletin.quote)
      if (quote_list.length != 0) {
        quote_list.forEach(async quote => {
          let result = await prisma.QUOTES.findFirst({
            where: {
              main_hash: quote.Hash,
              quote_hash: bulletin.hash
            }
          })
          if (!result) {
            result = await prisma.QUOTES.create({
              data: {
                main_hash: quote.Hash,
                quote_hash: bulletin.hash,
                address: bulletin.address,
                sequence: bulletin.sequence,
                content: bulletin.content,
                signed_at: bulletin.signed_at
              }
            })
            if (result) {
              console.log(`linking`, quote)
            }
          }
        })
      }
    }
  })

  // TODO: file
  //   // linking file
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
}

function main() {
  fs.mkdirSync(path.resolve('./BulletinFile'), { recursive: true })
  // config
  let config = fs.readFileSync(ConfigPath, 'utf8')
  config = JSON.parse(config)
  if (config.SelfURL != '') {
    SelfURL = config.SelfURL
  }
  let seed = config.Seed
  NodeList = config.NodeList

  if (seed === "") {
    seed = oxoKeyPairs.generateSeed("RandomSeed", 'secp256k1')
  }
  let keypair = oxoKeyPairs.deriveKeypair(seed)
  SelfAddress = oxoKeyPairs.deriveAddress(keypair.publicKey)
  SelfPublicKey = keypair.publicKey
  SelfPrivateKey = keypair.privateKey
  ConsoleWarn(`use******Seed: ${seed}`)
  ConsoleWarn(`use***Address: ${SelfAddress}`)

  bulletinStat()
  refreshData()
  startServerDaemon()

  if (jobNodeConn == null) {
    jobNodeConn = setInterval(keepNodeConn, 5000)
  }
  if (jobNodeSync == null) {
    jobNodeSync = setInterval(keepNodeSync, 8 * 60 * 60 * 1000)
  }
}

main()