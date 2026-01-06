import express from 'express'
import cors from 'cors'
import * as line from '@line/bot-sdk'
import apiRoutes from './routes/apiRouter.js'
import webhookRoutes from './routes/webhookRouter.js'
import 'dotenv/config'
import mongoose from 'mongoose'

const app = express()
const PORT = 5001

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ 資料庫連線成功')
    app.listen(PORT, () => {
      console.log(`✅ Node Server running at http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('❌ 資料庫連線失敗', err)
  })

app.use(cors())

app.use('/api', apiRoutes)

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
}
app.use('/webhook', line.middleware(config), webhookRoutes(config))
