"use client"

import React from 'react'
import { useQRCode } from 'next-qrcode'

export default function QRCode({ content }) {
  const { SVG } = useQRCode()
  return (
    <SVG
      text={content}
      options={{
        margin: 1,
        width: 100,
        color: {
          dark: '#010599FF',
          light: '#FFBF60FF',
        },
      }}
    />
  )
}