import { ProxyAgent, setGlobalDispatcher } from 'undici'
import { Main } from './components/Main'

const allProxy = process.env.all_proxy
const httpsProxy = process.env.https_proxy
const httpProxy = process.env.http_proxy

let proxyUrl

if (allProxy)
  proxyUrl = allProxy
else if (httpsProxy)
  proxyUrl = httpsProxy
else if (httpProxy)
  proxyUrl = httpProxy

if (proxyUrl) {
  const agent = new ProxyAgent({
    uri: proxyUrl,
  })
  setGlobalDispatcher(agent)
}

export default Main
