import React from 'react'
import Image from 'next/image'

export default function Timestamp({ str, size }) {
  // const Crypto = require('crypto')
  // let md5 = Crypto.createHash('md5').update(str).digest('hex')
  // console.log(md5)
  return (
    <img alt={str}
      src={`https://www.gravatar.com/avatar/${str}?s=${size}&d=retro&r=g`}
      width={size}
      height={size}
      loading="lazy"
    />
  )
}