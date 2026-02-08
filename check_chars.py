
import sys

def check_file(filename):
    try:
        with open(filename, 'rb') as f:
            content = f.read()
            for i, byte in enumerate(content):
                if byte > 127:
                    print(f"Non-ASCII character at byte {i}: {byte} ({hex(byte)})")
                    # Show context
                    start = max(0, i - 10)
                    end = min(len(content), i + 10)
                    print(f"Context: {content[start:end]}")
                    return
            print("No non-ASCII characters found.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        check_file(sys.argv[1])
    else:
        print("Usage: python check_chars.py <filename>")
