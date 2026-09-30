# HTTPS CONNECT 전용 프록시. 받는 주소는 인자로 넘기고(예: Tailscale 주소), www.wanted.co.kr:443만 중계한다.
# 사용: python3 connect-proxy.py 100.66.95.61 [포트]
import asyncio
import sys

ALLOW = ('www.wanted.co.kr:443',)
BIND = sys.argv[1]
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 18888


async def pipe(r, w):
    try:
        while d := await r.read(65536):
            w.write(d)
            await w.drain()
    except Exception:
        pass
    finally:
        w.close()


async def handle(cr, cw):
    line = (await cr.readline()).decode().split()
    while (await cr.readline()) not in (b'\r\n', b''):
        pass
    if len(line) < 2 or line[0] != 'CONNECT' or line[1] not in ALLOW:
        cw.write(b'HTTP/1.1 403 Forbidden\r\n\r\n')
        cw.close()
        return
    host, port = line[1].rsplit(':', 1)
    try:
        ur, uw = await asyncio.open_connection(host, int(port))
    except Exception:
        cw.write(b'HTTP/1.1 502 Bad Gateway\r\n\r\n')
        cw.close()
        return
    cw.write(b'HTTP/1.1 200 Connection Established\r\n\r\n')
    await asyncio.gather(pipe(cr, uw), pipe(ur, cw))


async def main():
    server = await asyncio.start_server(handle, BIND, PORT)
    await server.serve_forever()


asyncio.run(main())
