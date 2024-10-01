const Crypto = require('crypto')
const Fs = require('fs')

const ConsoleColors = {
  'bright': '\x1B[1m%s\x1B[0m', // 亮色
  'grey': '\x1B[2m%s\x1B[0m', // 灰色
  'italic': '\x1B[3m%s\x1B[0m', // 斜体
  'underline': '\x1B[4m%s\x1B[0m', // 下划线
  'reverse': '\x1B[7m%s\x1B[0m', // 反向
  'hidden': '\x1B[8m%s\x1B[0m', // 隐藏
  'black': '\x1B[30m%s\x1B[0m', // 黑色
  'red': '\x1B[31m%s\x1B[0m', // 红色
  'green': '\x1B[32m%s\x1B[0m', // 绿色
  'yellow': '\x1B[33m%s\x1B[0m', // 黄色
  'blue': '\x1B[34m%s\x1B[0m', // 蓝色
  'magenta': '\x1B[35m%s\x1B[0m', // 品红
  'cyan': '\x1B[36m%s\x1B[0m', // 青色
  'white': '\x1B[37m%s\x1B[0m', // 白色
  'blackBG': '\x1B[40m%s\x1B[0m', // 背景色为黑色
  'redBG': '\x1B[41m%s\x1B[0m', // 背景色为红色
  'greenBG': '\x1B[42m%s\x1B[0m', // 背景色为绿色
  'yellowBG': '\x1B[43m%s\x1B[0m', // 背景色为黄色
  'blueBG': '\x1B[44m%s\x1B[0m', // 背景色为蓝色
  'magentaBG': '\x1B[45m%s\x1B[0m', // 背景色为品红
  'cyanBG': '\x1B[46m%s\x1B[0m', // 背景色为青色
  'whiteBG': '\x1B[47m%s\x1B[0m' // 背景色为白色
}

function ConsoleInfo(str) {
  console.log(ConsoleColors.green, str)
}

function ConsoleWarn(str) {
  console.log(ConsoleColors.yellow, str)
}

function ConsoleError(str) {
  console.log(ConsoleColors.red, str)
}

function ConsoleDebug(str) {
  console.log(ConsoleColors.redBG, str)
}

// server url
const url_regex = /^wss:\/\/(?!-)([a-zA-Z0-9-]+)(?<!-)\.(?!-)([a-zA-Z0-9-]+)(?<!-)\.([a-zA-Z]{2,6})$/

function CheckServerURL(url) {
  return url_regex.test(url)
}

// json
function CloneJson(json) {
  return JSON.parse(JSON.stringify(json))
}

function UniqArray(arr) {
  return Array.from(new Set(arr))
}

// crypto
function HasherSHA512(str) {
  let sha512 = Crypto.createHash("sha512")
  sha512.update(str)
  return sha512.digest('hex')
}

function HalfSHA512(str) {
  return HasherSHA512(str).toUpperCase().substring(0, 64)
}

// for bulletin object
function QuarterSHA512(str) {
  return HasherSHA512(str).toUpperCase().substring(0, 32);
}

function StrToHex(str) {
  let arr = []
  let length = str.length
  for (let i = 0; i < length; i++) {
    arr[i] = (str.charCodeAt(i).toString(16))
  }
  return arr.join('').toUpperCase()
}

function FileHashSync(file_path) {
  let file_content
  try {
    file_content = Fs.readFileSync(file_path)
  } catch (err) {
    console.error(err)
    return null
  }

  const sha1 = Crypto.createHash('sha1')
  sha1.update(file_content)
  return sha1.digest('hex').toUpperCase()
}


module.exports = {
  ConsoleInfo,
  ConsoleWarn,
  ConsoleError,
  ConsoleDebug,

  CloneJson,
  UniqArray,
  CheckServerURL,

  HalfSHA512,
  QuarterSHA512,
  StrToHex,
  FileHashSync
}