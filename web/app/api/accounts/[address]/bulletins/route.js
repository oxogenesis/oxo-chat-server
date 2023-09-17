import { NextResponse } from 'next/server'

import { PageSize, Json2Str } from '@/lib/Util'

import prisma from '@/lib/prisma';
// import { PrismaClient } from '@prisma/client'
// const prisma = new PrismaClient()

export async function GET(request, { params }) {
  // console.log(`=============================>>>0`)
  const { address = "" } = params
  let page = request.nextUrl.searchParams.get("page")
  try {
    let bulletins = await prisma.BULLETINS.findMany({
      skip: (page - 1) * PageSize,
      take: PageSize,
      where: {
        address: address
      },
      orderBy: {
        signed_at: 'desc',
      }
    })
    let bulletin_size = await prisma.BULLETINS.count({
      where: {
        address: address
      }
    })
    bulletins = Json2Str(bulletins)
    bulletins = JSON.parse(bulletins)
    return NextResponse.json({ bulletins: bulletins, bulletin_size: bulletin_size })
    // return res.status(200).json(data)
  } catch (error) {
    // console.log(`=============================3`)
    console.log(error)
    return NextResponse.json({ error })
  }
}