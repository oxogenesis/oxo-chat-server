const fs = require('fs')
const Crypto = require('crypto')
const path = require('path')
const sqlite3 = require('sqlite3')
const oxoKeyPairs = require("oxo-keypairs")

// const GenesisHash = quarterSHA512('obeTvR9XDbUwquA6JPQhmbgaCCaiFa2rvf')
const GenesisHash = 'F4C2EB8A3EBFC7B6D81676D79F928D0E'

const FileMaxSize = 16 * 1024 * 1024
const FileChunkSize = 64 * 1024
const BulletinFileExtRegex = /jpg|png|jpeg|txt|md/i

// config
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

const DestDBPath = `./DB/${Address}.db`
let CurrentSequence = 0
let CurrentPreHash = GenesisHash

// keep alive
process.on('uncaughtException', function (err) {
  // 打印出错误
  console.log(err)
  // 打印出错误的调用栈方便调试
  console.log(err.stack)
})

// crypto
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

// oxo
function sign(msg, sk) {
  let msgHexStr = strToHex(msg)
  let sig = oxoKeyPairs.sign(msgHexStr, sk)
  return sig
}

// message generator
const ObjectType = {
  Bulletin: 101,
  BulletinFileChunk: 102,

  PrivateFile: 201,

  GroupManage: 301,
  GroupMessage: 302,
  GroupFile: 303
}

function genBulletinJson(sequence, pre_hash, quote, file, content, timestamp) {
  let content_hash = quarterSHA512(content)
  let tmp_json = {
    ObjectType: ObjectType.Bulletin,
    Sequence: sequence,
    PreHash: pre_hash,
    Quote: quote,
    File: file,
    ContentHash: content_hash,
    Timestamp: timestamp,
    PublicKey: PublicKey
  }
  let sig = sign(JSON.stringify(tmp_json), PrivateKey)

  let json = {
    ObjectType: ObjectType.Bulletin,
    Sequence: sequence,
    PreHash: pre_hash,
    Quote: quote,
    File: file,
    Content: content,
    Timestamp: timestamp,
    PublicKey: PublicKey,
    Signature: sig
  }
  return json
}

// db
if (fs.existsSync(DestDBPath)) {
  fs.rmSync(DestDBPath)
}

let SourDB = new sqlite3.Database(SourDBPath)
let DestDB = new sqlite3.Database(DestDBPath)

function initDestDB() {
  // 建表
  DestDB.serialize(() => {
    // 为账号地址起名
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

async function queryAll(sql) {
  return new Promise((resolve, reject) => {
    DestDB.all(sql, [], (err, items) => {
      if (err) {
        reject(err)
      } else {
        resolve(items)
      }
    })
  })
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

function gen_bulletin() {
  let begin_at = Date.now()

  let SQL = `SELECT * FROM ${SourTable} where ${SourCondition} ORDER BY ${SourColumnTimestamp} ASC`
  SourDB.all(SQL, async (err, bulletins) => {
    if (err) {
      console.log(err)
    } else {
      console.log(`>>>>>>>>>>>>>>>>>>>>>>>BulletinCount: ${bulletins.length}`)

      for (let i = 0; i < bulletins.length; i++) {
        const tmp_bulletin = bulletins[i]
        let quote = []
        if (tmp_bulletin[SourColumnQuote]) {
          quote = JSON.parse(tmp_bulletin[SourColumnQuote])
        }
        let file = []
        if (tmp_bulletin[SourColumnFile]) {
          file = JSON.parse(tmp_bulletin[SourColumnFile])
        }
        let content = tmp_bulletin[SourColumnContent]//.replace(/<br>/g, '\n')
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
          // check bulletin file
          if (file.length > 0) {
            console.log(file)
            console.log(file.length)
            for (let j = 0; j < file.length; j++) {
              const f = file[j]
              let file_dir = `./BulletinFile/${f.Hash.substring(0, 3)}/${f.Hash.substring(3, 6)}`
              let file_path = `${file_dir}/${f.Hash}`
              if (fs.existsSync(file_path)) {
                let hash = genFileHashSync(path.resolve(file_path))
                if (hash != f.Hash) {
                  console.log(`!!! file ${f.Hash} not ready`)
                }
              } else {
                console.log(`!!! file ${f.Hash} not exist`)
              }
            }
          }
        } else {
          console.log(`something wrong++++++++++++++++++++++++++++++`)
        }
      }

      let end_at = Date.now()
      console.log(`>>>>>>>>>>>>>>>>>>>>>>>Cost Time:`, end_at - begin_at)
    }
  })
}

async function move_bulletin_file() {
  let file_list = fs.readdirSync(`./BulletinFile`)
  for (let i = 0; i < file_list.length; i++) {
    const file = file_list[i]
    let sour_file_path = `./BulletinFile/${file}`
    let stat = fs.statSync(sour_file_path)
    if (stat.isFile()) {
      if (stat.size <= FileMaxSize && BulletinFileExtRegex.exec(file)) {
        let hash = genFileHashSync(sour_file_path)
        let dest_file_dir = `./BulletinFile/${hash.substring(0, 3)}/${hash.substring(3, 6)}`
        fs.mkdirSync(path.resolve(dest_file_dir), { recursive: true })
        let dest_file_path = `${dest_file_dir}/${hash}`
        fs.cpSync(sour_file_path, dest_file_path)
        fs.rmSync(sour_file_path)
        console.log(`cache file#${hash} : ${file}`)
      } else {
        fs.rmSync(sour_file_path)
        console.log(`file invalid : ${file}`)
      }
    }
  }
}

function go() {
  console.log(`use account: ${Address}`)
  initDestDB()
  gen_bulletin()
  move_bulletin_file()
}

go()