import Link from "next/link"
import React from "react"
import DarkMode from "./DarkMode"

export default function Header() {
  return (
    <div className="flex justify-between">
      <div className="">
        <Link href={`/`} className="font-bold text-4xl text-gray-800 hover:text-gray-500">首页</Link>
      </div>
      <div className="">
        <Link href={`/bulletins`} className="font-bold text-4xl text-gray-800 hover:text-gray-500">帖子</Link>
      </div>
      <div className="">
        <Link href={`/accounts`} className="font-bold text-4xl text-gray-800 hover:text-gray-500">账号</Link>
      </div>
      <div className="">
        <Link href={`/about`} className="font-bold text-4xl text-gray-800 hover:text-gray-500">关于</Link>
      </div>
      <div className="">
      </div>
      <div className="">
      </div>
      <div className="">
      </div>
      <div className="">
      </div>
      <div className="">
      </div>
      <div className="">
      </div>
      <DarkMode />
    </div>
  )
}