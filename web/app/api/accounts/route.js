import { NextResponse } from 'next/server'

import { PageSize, Json2Str } from '../../../lib/Util'

import prisma from '@/lib/prisma';
// import { PrismaClient } from '@prisma/client'
// const prisma = new PrismaClient()

export async function GET(request, { params }) {
  // console.log(`api/accounts=============================>>>0`)
  try {
    let accounts = await prisma.BULLETINS.groupBy({
      by: ['address'],
      _count: {
        hash: true,
      },
      orderBy: {
        address: 'desc',
      }
    })
    accounts.sort(function (a, b) { return b._count.hash - a._count.hash })
    return NextResponse.json({ accounts: accounts })
  } catch (error) {
    // console.log(`=============================3`)
    console.log(error)
    return NextResponse.json({ error })
  }
}