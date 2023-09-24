import { NextResponse } from 'next/server'

import { Json2Str } from '../../../lib/Util'

import prisma from '@/lib/prisma';
// import { PrismaClient } from '@prisma/client'
// const prisma = new PrismaClient()

export async function GET(request, { params }) {
  // console.log(`api/home=============================>>>0`)
  try {
    //bulletin size
    let bulletin_size = await prisma.BULLETINS.count()
    //account size
    let accounts = await prisma.BULLETINS.groupBy({
      by: ['address'],
      _count: {
        hash: true,
      },
      orderBy: {
        address: 'desc',
      }
    })
    //hot bulletin
    let hot_bulletins_hash = await prisma.QUOTES.groupBy({
      by: ['main_hash'],
      _count: {
        quote_hash: true,
      },
      orderBy: {
        main_hash: 'desc',
      }
    })
    hot_bulletins_hash.sort(function (a, b) { return b._count.quote_hash - a._count.quote_hash })
    hot_bulletins_hash = hot_bulletins_hash.map((bulletin) => (bulletin.main_hash)).slice(0, 10)
    let bulletins = await prisma.BULLETINS.findMany({
      where: {
        hash: { in: hot_bulletins_hash }
      }
    })
    bulletins = Json2Str(bulletins)
    bulletins = JSON.parse(bulletins)
    bulletins.sort(function (a, b) { return hot_bulletins_hash.indexOf(a.hash) - hot_bulletins_hash.indexOf(b.hash) })
    return NextResponse.json({ bulletins: bulletins, bulletin_size: bulletin_size, account_size: accounts.length })
    // return res.status(200).json(data)
  } catch (error) {
    // console.log(`=============================3`)
    console.log(error)
    return NextResponse.json({ error })
  }
}