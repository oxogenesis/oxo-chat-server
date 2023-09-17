import React from 'react'
import { timestamp_format } from '@/lib/Util'

export default function Timestamp({ timestamp }) {
  return (
    <span className="px-1">@{timestamp_format(timestamp)}</span>
  )
}