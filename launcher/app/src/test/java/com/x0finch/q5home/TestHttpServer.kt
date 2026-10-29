package com.x0finch.q5home

import java.net.InetAddress
import java.net.ServerSocket
import kotlin.concurrent.thread

/** 测试用的极简 HTTP 服务：按路径返回 (状态码, 内容)。 */
class TestHttpServer(private val handler: (path: String) -> Pair<Int, ByteArray>) : AutoCloseable {
    private val server = ServerSocket(0, 50, InetAddress.getLoopbackAddress())
    val base = "http://127.0.0.1:${server.localPort}"

    init {
        thread(isDaemon = true) {
            while (!server.isClosed) {
                val socket = runCatching { server.accept() }.getOrNull() ?: break
                socket.use { s ->
                    val reader = s.getInputStream().bufferedReader()
                    val path = reader.readLine()?.split(" ")?.getOrNull(1) ?: return@use
                    while (reader.readLine()?.isNotEmpty() == true) { /* 跳过请求头 */ }
                    val (code, body) = handler(path)
                    val out = s.getOutputStream()
                    out.write("HTTP/1.1 $code X\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray())
                    out.write(body)
                    out.flush()
                }
            }
        }
    }

    override fun close() = server.close()
}
