import React from 'react'
import Link from "next/link"

export default function Account({ address }) {
  return (
    <Link href={`/accounts/${address}/bulletins`} className="inline font-bold bg-indigo-500 rounded-md px-1 mx-1">{address}</Link>
  )
}