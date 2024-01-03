import React from 'react'
import Link from "next/link"

export default function LinkBulletin({ hash, str }) {
  return (
    <Link href={`/bulletins/${hash}`} className="font-bold bg-yellow-500 rounded-md px-1 mx-1">{str}</Link>
  )
}