const PageSize = 20

function cal_page_count(size) {
  let page = size * 1.0 / PageSize
  return Math.ceil(page)
}

function add0(m) { return m < 10 ? '0' + m : m }

function timestamp_format(timestamp) {
  timestamp = parseInt(timestamp)
  let time = new Date(timestamp)
  let y = time.getFullYear()
  let m = time.getMonth() + 1
  let d = time.getDate()
  let h = time.getHours()
  let mm = time.getMinutes()
  let s = time.getSeconds()

  timestamp = new Date()
  let tmp = ''
  if (y != timestamp.getFullYear()) {
    tmp += y + '-' + add0(m) + '-' + add0(d) + ' '
  } else {
    tmp += add0(m) + '-' + add0(d) + ' '
  }
  return tmp + add0(h) + ':' + add0(mm) + ':' + add0(s)
}

function Json2Str(json) {
  return JSON.stringify(
    json,
    (key, value) => (typeof value === 'bigint' ? value.toString() : value)
  )
}

export {
  PageSize,
  cal_page_count,
  timestamp_format,
  Json2Str
}