
import sys

def check_file(filename):
    suspicious_chars = {
        0xe2809c: 'Left Double Quote',
        0xe2809d: 'Right Double Quote',
        0xe28098: 'Left Single Quote',
        0xe28099: 'Right Single Quote',
        0xe2808b: 'Zero Width Space',
        0xc2a0: 'Non-breaking Space',
        0xe28093: 'En Dash',
        0xe28094: 'Em Dash',
    }
    
    try:
        with open(filename, 'rb') as f:
            content = f.read()
            
        found = False
        for i in range(len(content)):
            # Check 3-byte chars
            if i + 2 < len(content):
                chunk = (content[i] << 16) | (content[i+1] << 8) | content[i+2]
                if chunk in suspicious_chars:
                    print(f"Found {suspicious_chars[chunk]} at byte {i}")
                    found = True
            
            # Check 2-byte chars
            if i + 1 < len(content):
                chunk = (content[i] << 8) | content[i+1]
                if chunk in suspicious_chars:
                    print(f"Found {suspicious_chars[chunk]} at byte {i}")
                    found = True

        if not found:
            print("No suspicious characters found.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        check_file(sys.argv[1])
    else:
        print("Usage: python scan_syntax.py <filename>")
