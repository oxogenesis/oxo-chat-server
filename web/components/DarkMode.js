'use client'

import React from "react"
import { useState, useEffect } from "react"
import Image from "next/image"

export default function DarkMode() {
  const [theme, setTheme] = useState("light")
  function getThemeFromLocalStorage() {
    const savedTheme = localStorage.getItem("theme")
    if (savedTheme) {
      setTheme(savedTheme)
      if (savedTheme == 'dark') {
        document.getElementsByTagName("HTML")[0].classList.add('dark')
      }
    }
  }
  function toggleTheme() {
    setTheme((theme) => {
      let newTheme = ''
      if (theme != 'light') {
        newTheme = 'light'
        document.getElementsByTagName("HTML")[0].classList.remove('dark')
      } else {
        newTheme = 'dark'
        document.getElementsByTagName("HTML")[0].classList.add('dark')
      }
      setTheme(newTheme)
      localStorage.setItem("theme", newTheme)
      return newTheme
    })
  }
  useEffect(() => {
    getThemeFromLocalStorage()
  }, [theme])

  return (
    <div className="order-last">
      {theme == 'dark' ?
        <button onClick={toggleTheme}><Image src="/assets/mode_light.png" width={61} height={46} alt="light_mode"/></button>
        :
        <button onClick={toggleTheme}><Image src="/assets/mode_dark.png" width={61} height={46} alt="dark_mode"/></button>
      }
    </div>
  )
}

