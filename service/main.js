const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

const oxoKeyPairs = require("oxo-keypairs")

//config
const SelfURL = "ws://127.0.0.1:8000"
//standalone server
// const Seed = oxoKeyPairs.generateSeed("obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf", "secp256k1")
// const SelfURL = "wss://ru.oxo-chat-server.com"
const Seed = "xxJTfMGZPavnqHhcEcHw5ToPCHftw"
const OtherServer = []

//keep alive
process.on("uncaughtException", function (err) {
  //打印出错误
  console.log(err)
  //打印出错误的调用栈方便调试
  console.log(err.stack)
})

//json
const Schema = require("./schema.js")

function cloneJson(json) {
  return JSON.parse(JSON.stringify(json))
}

function toSetUniq(arr) {
  return Array.from(new Set(arr))
}

//ws
const WebSocket = require("ws")

//crypto
const Crypto = require("crypto")
const { setTimeout } = require("timers/promises")

function hasherSHA512(str) {
  let sha512 = Crypto.createHash("sha512")
  sha512.update(str)
  return sha512.digest("hex")
}

function halfSHA512(str) {
  return hasherSHA512(str).toUpperCase().substr(0, 64)
}

function quarterSHA512(str) {
  return hasherSHA512(str).toUpperCase().substr(0, 32);
}

//oxo

//const GenesisHash = quarterSHA512('obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf')
const GenesisAddress = 'obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf'
const GenesisHash = 'F4C2EB8A3EBFC7B6D81676D79F928D0E'

function strToHex(str) {
  let arr = []
  let length = str.length
  for (let i = 0; i < length; i++) {
    arr[i] = (str.charCodeAt(i).toString(16))
  }
  return arr.join("").toUpperCase()
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
  let sig = json.Signature
  delete json.Signature
  let tmpMsg = JSON.stringify(json)
  if (verifySignature(tmpMsg, sig, json.PublicKey)) {
    json.Signature = sig
    return true
  } else {
    console.log("signature invalid...")
    return false
  }
}

let ActionCode = {
  Declare: 100,
  ObjectResponse: 101,

  BulletinRandom: 200,
  BulletinRequest: 201,
  BulletinFileRequest: 202,
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

const ObjectType = {
  Bulletin: 101,
  BulletinFile: 102,

  PrivateFile: 201,

  GroupManage: 301,
  GroupMessage: 302,
  GroupFile: 303
}

function strServerMessage(msgCode) {
  msgJson = { Action: ActionCode.ServerMessage, Code: msgCode }
  return JSON.stringify(msgJson)
}

function sendServerMessage(ws, msgCode) {
  ws.send(strServerMessage(msgCode))
}

//client connection
let ClientConns = {}

function fetchClientConnAddress(ws) {
  for (let address in ClientConns) {
    if (ClientConns[address] == ws) {
      return address
    }
  }
  return null
}

let ClientServer = null

//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
//client listener
function teminateClientConn(ws) {
  ws.close()
  let connAddress = fetchClientConnAddress(ws)
  if (connAddress != null) {
    console.log(`###################LOG################### client disconnect... <${connAddress}>`)
    delete ClientConns[connAddress]
  }
}

////////hard copy from client<<<<<<<<
// let BulletinCount = 0
const PageSize = 20
// let PageCount = BulletinCount / PageSize
// let PageLinks = ""
// let BulletinAccounts = []

const keypair = oxoKeyPairs.deriveKeypair(Seed)
const ServerAddress = oxoKeyPairs.deriveAddress(keypair.publicKey)
const ServerPublicKey = keypair.publicKey
const ServerPrivateKey = keypair.privateKey

function sign(msg, sk) {
  let msgHexStr = strToHex(msg);
  let sig = oxoKeyPairs.sign(msgHexStr, sk);
  return sig;
}

function GenBulletinRequest(address, sequence, to) {
  let json = {
    Action: ActionCode.BulletinRequest,
    Address: address,
    Sequence: sequence,
    To: to,
    Timestamp: Date.now(),
    PublicKey: ServerPublicKey
  }
  let sig = sign(JSON.stringify(json), ServerPrivateKey)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
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

function GenObjectResponse(object, to) {
  let json = {
    Action: ActionCode.ObjectResponse,
    Object: object,
    To: to,
    Timestamp: Date.now(),
    PublicKey: ServerPublicKey,
  }
  let sig = sign(JSON.stringify(json), ServerPrivateKey)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}

function GenChatSync(pair_address, current_sequence) {
  let json = {
    Action: ActionCode.ChatSyncFromServer,
    PairAddress: pair_address,
    CurrentSequence: current_sequence,
    Timestamp: Date.now(),
    PublicKey: ServerPublicKey,
  }
  let sig = sign(JSON.stringify(json), ServerPrivateKey)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}

function GenDeclare() {
  //send declare to server
  let json = {
    Action: ActionCode.Declare,
    Timestamp: Date.now(),
    PublicKey: ServerPublicKey
  }
  let sig = sign(JSON.stringify(json), ServerPrivateKey)
  json.Signature = sig
  let strJson = JSON.stringify(json)
  return strJson
}

async function CacheBulletin(bulletin) {
  let timestamp = Date.now()
  let hash = quarterSHA512(JSON.stringify(bulletin))
  let address = oxoKeyPairs.deriveAddress(bulletin.PublicKey)

  let b = await prisma.BULLETINS.findFirst({
    where: {
      hash: hash,
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
        json: JSON.stringify(bulletin),
        signed_at: bulletin.Timestamp,
        created_at: timestamp
      }
    })

    if (result) {
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

      //Brocdcast to OtherServer
      for (let i in OtherServer) {
        let ws = ClientConns[OtherServer[i].Address]
        if (ws != undefined && ws.readyState == WebSocket.OPEN) {
          ws.send(GenObjectResponse(bulletin, OtherServer[i].Address))
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
      ClientConns[sour_address].send(`${dh.json2}`)
    } else if (address2 == sour_address && dh.json1 != "") {
      ClientConns[sour_address].send(`${dh.json1}`)
    }
  }
}

async function CacheMessage(json) {
  let str_json = JSON.stringify(json)
  let hash = quarterSHA512(str_json)
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
    ClientConns[sour_address].send(`${msg}`)
  }
}

const DelayExec = (ms) => new Promise(resolve => setTimeout(resolve, ms))

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
    console.log(i)
    ClientConns[dest_address].send(`${msg_list[i].json}`)
  }
}

async function handleClientMessage(message, json) {
  if (json.To != null) {
    if (ClientConns[json.To] != null && ClientConns[json.To].readyState == WebSocket.OPEN) {
      // 對方在綫
      //forward message
      ClientConns[json.To].send(`${message}`)
    }

    if (json.Action == ActionCode.ChatMessage) {
      CacheMessage(json)
    } else if (json.Action == ActionCode.ChatSync) {
      HandelChatSync(json)
    } else if (json.Action == ActionCode.ChatDH) {
      CacheECDH(json)
      HandelECDHSync(json)
    }


    //cache bulletin
    if (json.Action == ActionCode.ObjectResponse && json.Object.ObjectType == ObjectType.Bulletin) {
      CacheBulletin(json.Object)
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
      ClientConns[address].send(bulletin.json)
    }
  } else if (json.Action == ActionCode.BulletinRandom) {
    //send random bulletin
    let bulletin = await prisma.$queryRaw`SELECT * FROM "public"."BULLETINS" ORDER BY RANDOM() LIMIT 1`
    if (bulletin != null) {
      let address = oxoKeyPairs.deriveAddress(json.PublicKey)
      ClientConns[address].send(bulletin[0].json)
    }
  } else if (json.To == ServerAddress && json.Action == ActionCode.ObjectResponse && json.Object.ObjectType == ObjectType.Bulletin) {
    CacheBulletin(json.Object)
    //fetch more bulletin
    let address = oxoKeyPairs.deriveAddress(json.Object.PublicKey)
    if (ClientConns[address] != null && ClientConns[address].readyState == WebSocket.OPEN) {
      let msg = GenBulletinRequest(address, json.Object.Sequence + 1, address)
      ClientConns[address].send(msg)
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
    let msg = GenBulletinAddressListResponse(json.Page, address_list)
    ClientConns[address].send(msg)
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
    ClientConns[address].send(msg)
  }
}

async function checkClientMessage(ws, message) {
  console.log(`###################LOG################### Client Message:`)
  console.log(`${message}`)
  let json = Schema.checkClientSchema(message)
  if (json == false) {
    //json格式不合法
    sendServerMessage(ws, MessageCode.JsonSchemaInvalid)
    // console.log(`json格式不合法`)
    teminateClientConn(ws)
  } else {
    let address = oxoKeyPairs.deriveAddress(json.PublicKey)
    if (ClientConns[address] == ws) {
      // 连接已经通过"声明消息"校验过签名
      // "声明消息"之外的其他消息，由接收方校验
      // 伪造的"公告消息"无法通过接收方校验，也就无法被接受方看见（进而不能被引用），也就不具备传播能力
      // 伪造的"消息"无法通过接收方校验，也就无法被接受方看见
      // 所以服务器端只校验"声明消息"签名的有效性，并与之建立连接，后续消息无需校验签名，降低服务器运算压力
      handleClientMessage(message, json)
    } else {
      let connAddress = fetchClientConnAddress(ws)
      if (connAddress != null && connAddress != address) {
        //using different address in same connection
        sendServerMessage(ws, MessageCode.AddressChanged)
        teminateClientConn(ws)
      } else {
        if (!VerifyJsonSignature(json)) {
          //"声明消息"签名不合法
          sendServerMessage(ws, MessageCode.SignatureInvalid)
          teminateClientConn(ws)
          return
        }

        if (json.Timestamp + 60000 < Date.now()) {
          //"声明消息"生成时间过早
          sendServerMessage(ws, MessageCode.TimestampInvalid)
          teminateClientConn(ws)
          return
        }

        if (connAddress == null && ClientConns[address] == null) {
          //new connection and new address
          //当前连接无对应地址，当前地址无对应连接，全新连接
          console.log(`connection established from client <${address}>`)
          ClientConns[address] = ws
          //handleClientMessage(message, json)
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
          let msg = GenBulletinRequest(address, sequence, address)
          ClientConns[address].send(msg)
        } else if (ClientConns[address] != ws && ClientConns[address].readyState == WebSocket.OPEN) {
          //new connection kick old conection with same address
          //当前地址有对应连接，断开旧连接，当前地址对应到当前连接
          sendServerMessage(ClientConns[address], MessageCode.NewConnectionOpening)
          ClientConns[address].close()
          ClientConns[address] = ws
          //handleClientMessage(message, json)
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

function keepOtherServerConn() {
  let notConnected = []
  for (let i in OtherServer) {
    if (ClientConns[OtherServer[i].Address] == undefined) {
      notConnected.push(OtherServer[i])
    }
  }

  if (notConnected.length == 0) {
    return
  }

  let random = Math.floor(Math.random() * (notConnected.length))
  let randomServerUrl = notConnected[random].URL
  if (randomServerUrl != null) {
    console.log(`keepOtherServerConn connecting to StaticCounter ${randomServerUrl}`)
    try {
      var ws = new WebSocket(randomServerUrl)

      ws.on("open", function open() {
        ws.send(GenDeclare())
        ClientConns[notConnected[random].Address] = ws
      })

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
    } catch (e) {
      console.log("keepOtherServerConn error...")
    }
  }
}

let OtherServerConnJob = null
if (OtherServerConnJob == null) {
  OtherServerConnJob = setInterval(keepOtherServerConn, 5000);
}
