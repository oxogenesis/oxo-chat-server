import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { PageSize, Json2Str } from '@/lib/Util'

const prisma = new PrismaClient()

export async function GET(request, { params }) {
  // console.log(`=============================>>>0`)
  let page = request.nextUrl.searchParams.get("page")
  const { hash = "" } = params
  try {
    let bulletin = await prisma.BULLETINS.findFirst({
      where: {
        hash: hash,
      }
    })
    bulletin = Json2Str(bulletin)
    bulletin = JSON.parse(bulletin)

    let next = await prisma.BULLETINS.findFirst({
      where: {
        address: bulletin.address,
        sequence: bulletin.sequence + 1
      },
      select: {
        hash: true
      }
    })

    let replys = await prisma.QUOTES.findMany({
      where: {
        main_hash: bulletin.hash
      },
      skip: (page - 1) * PageSize,
      take: PageSize,
      orderBy: {
        signed_at: 'asc'
      }
    })
    replys = Json2Str(replys)
    replys = JSON.parse(replys)

    let reply_size = await prisma.QUOTES.count({
      where: {
        main_hash: bulletin.hash
      }
    })

    return NextResponse.json({ bulletin: bulletin, next: next, replys: replys, reply_size: reply_size })
    // return res.status(200).json(data)
  } catch (error) {
    // console.log(`=============================3`)
    console.log(error)
    return NextResponse.json({ error })
  }
}