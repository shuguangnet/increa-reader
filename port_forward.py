"""Simple TCP port forwarder that binds to 0.0.0.0 and forwards to localhost.

This allows external access to services running inside a Docker container
that are only listening on localhost.

Usage: python3 port_forward.py
"""
import asyncio
import signal
import sys

FORWARDS = [
    (3002, 3002),  # Backend API
    (5177, 5177),  # Frontend dev server
]

BIND_HOST = "0.0.0.0"
CONNECT_HOST = "127.0.0.1"
BUFFER_SIZE = 65536


async def forward_data(reader, writer):
    """Forward data between two endpoints."""
    try:
        while True:
            data = await reader.read(BUFFER_SIZE)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError, OSError):
        pass
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


async def handle_connection(external_port, reader, writer):
    """Handle an incoming connection and forward it to the target."""
    try:
        target_reader, target_writer = await asyncio.open_connection(
            CONNECT_HOST, external_port
        )
        await asyncio.gather(
            forward_data(reader, target_writer),
            forward_data(target_reader, writer),
            return_exceptions=True,
        )
    except (ConnectionError, OSError) as e:
        pass
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


async def start_forwarder(external_port, internal_port):
    """Start a TCP forwarder for one port."""
    server = await asyncio.start_server(
        lambda r, w: handle_connection(external_port, r, w),
        BIND_HOST,
        external_port,
        reuse_port=True,
    )
    addr = server.sockets[0].getsockname()
    print(f"  ✅ Forwarding {BIND_HOST}:{external_port} → {CONNECT_HOST}:{internal_port}")
    async with server:
        await server.serve_forever()


async def main():
    print("🚀 Starting port forwarder...")
    print(f"   Binding to: {BIND_HOST}")
    print(f"   Forwarding to: {CONNECT_HOST}")
    print(f"   Ports: {', '.join(f'{e}→{i}' for e, i in FORWARDS)}")
    print()

    servers = []
    for ext_port, int_port in FORWARDS:
        server_task = asyncio.create_task(start_forwarder(ext_port, int_port))
        servers.append(server_task)

    print("✨ Port forwarder running! Press Ctrl+C to stop.")
    print()

    try:
        await asyncio.gather(*servers)
    except asyncio.CancelledError:
        pass


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Port forwarder stopped.")