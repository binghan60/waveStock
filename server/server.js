import express from 'express'
import cors from 'cors'
import axios from 'axios'
import * as line from '@line/bot-sdk'
import apiRoutes from './routes/apiRouter.js'
import webhookRoutes from './routes/webhookRouter.js'
import 'dotenv/config'

const app = express()
const PORT = 3001

app.use(cors())

app.use('/api', apiRoutes)

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
}
app.use('/webhook', line.middleware(config), webhookRoutes(config))

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})
