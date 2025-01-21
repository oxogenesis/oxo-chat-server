import React from 'react'
import Link from "next/link"
import { cal_page_count } from '@/lib/Util'

function Pagination({ url, page_size, page_cursor }) {

  const renderList = () => {
    let page_count = cal_page_count(page_size)
    page_cursor = parseInt(page_cursor)
    const listItems = []
    if (page_count < 16) {
      for (let i = 1; i <= page_count; i++) {
        if (i == page_cursor) {
          listItems.push(<li key={i} className="inline font-bold px-2">
            <span className='text-blue-500'>{` ${i} `}</span>
          </li>)
        } else {
          listItems.push(<li key={i} className="inline font-bold bg-blue-500 px-2 rounded-lg">
            <Link href={`${url}?page=${i}`}>{` ${i} `}</Link>
          </li>)
        }
      }
    } else if (page_count >= 16) {
      let left = page_cursor - 1 > 8 ? 8 : page_cursor - 1
      let right = 16 - left

      for (let i = page_cursor - left; i < page_cursor; i++) {
        listItems.push(<li key={i} className="inline font-bold bg-blue-500 px-2 rounded-lg">
          <Link href={`${url}?page=${i}`}>{` ${i} `}</Link>
        </li>)
      }

      listItems.push(<li key={page_cursor} className="inline font-bold px-2">
        <span className='text-blue-500'>{` ${page_cursor} `}</span>
      </li>)

      for (let i = page_cursor + 1; i <= page_cursor + right; i++) {
        listItems.push(<li key={i} className="inline font-bold bg-blue-500 px-2 rounded-lg">
          <Link href={`${url}?page=${i}`}>{` ${i} `}</Link>
        </li>)
      }
    }
    return listItems
  }
  return <ul className='py-1'>{renderList()}</ul>
}
export default Pagination