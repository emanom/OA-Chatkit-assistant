#!/usr/bin/env python3
"""Extract private key from PFX file to PEM format for AWS ACM import"""

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import pkcs12
import sys

def extract_private_key(pfx_path, password, output_path):
    """Extract private key from PFX file and save as PEM"""
    try:
        # Read PFX file
        with open(pfx_path, 'rb') as f:
            pfx_data = f.read()
        
        # Load PFX with password
        private_key, certificate, additional_certificates = pkcs12.load_key_and_certificates(
            pfx_data, 
            password.encode() if isinstance(password, str) else password
        )
        
        if private_key is None:
            print("Error: No private key found in PFX file")
            return False
        
        # Export private key in PEM format (PKCS#8)
        private_key_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        
        # Write to file
        with open(output_path, 'wb') as f:
            f.write(private_key_pem)
        
        print(f"Private key extracted successfully to {output_path}")
        print("\nFirst few lines:")
        with open(output_path, 'r') as f:
            lines = f.readlines()[:3]
            for line in lines:
                print(line.rstrip())
        
        return True
        
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    pfx_path = "certificate.pfx"
    password = "temp-password-123"
    output_path = "private-key.pem"
    
    success = extract_private_key(pfx_path, password, output_path)
    sys.exit(0 if success else 1)

