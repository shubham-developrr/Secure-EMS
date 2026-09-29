import os
import sys
from dotenv import load_dotenv
from web3 import Web3

def deploy():
    try:
        import solcx
    except ImportError:
        print("ERROR: Please run 'pip install py-solc-x' first.")
        sys.exit(1)

    print("Step 1: Installing Solidity compiler (this takes a few seconds)...")
    solcx.install_solc('0.8.20')
    solcx.set_solc_version('0.8.20')

    print("Step 2: Compiling contracts/AuditLedger.sol...")
    with open("contracts/AuditLedger.sol", "r") as f:
        contract_source = f.read()

    compiled_sol = solcx.compile_source(
        contract_source,
        output_values=['abi', 'bin']
    )

    contract_id, contract_interface = compiled_sol.popitem()
    bytecode = contract_interface['bin']
    abi = contract_interface['abi']

    load_dotenv()
    rpc_url = os.getenv("POLYGON_RPC_URL", "https://rpc-amoy.polygon.technology")
    private_key = os.getenv("PRIVATE_KEY")
    
    if not private_key or private_key.startswith("your_private_key"):
        print("---------------------------------------------------------")
        print("ERROR: You MUST put your MetaMask Private Key in the .env file first!")
        print("Open the .env file and set PRIVATE_KEY=your_actual_key_here")
        print("---------------------------------------------------------")
        sys.exit(1)

    print("Step 3: Connecting to Polygon Amoy...")
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        print("ERROR: Failed to connect to Polygon Amoy RPC.")
        sys.exit(1)

    account = w3.eth.account.from_key(private_key)
    print(f"Connected to Wallet: {account.address}")
    balance = w3.from_wei(w3.eth.get_balance(account.address), 'ether')
    print(f"Wallet Balance: {balance} POL")

    if balance == 0:
        print("ERROR: You have 0 POL in your wallet! Please go to the faucet and request tokens.")
        sys.exit(1)

    AuditLedger = w3.eth.contract(abi=abi, bytecode=bytecode)
    
    print("Step 4: Deploying contract to the blockchain (Please wait ~15 seconds)...")
    try:
        tx = AuditLedger.constructor().build_transaction({
            'chainId': 80002,
            'gasPrice': w3.eth.gas_price,
            'nonce': w3.eth.get_transaction_count(account.address),
        })

        signed_tx = w3.eth.account.sign_transaction(tx, private_key)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        print(f"Transaction sent successfully! Hash: {w3.to_hex(tx_hash)}")
        
        tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        contract_address = tx_receipt.contractAddress
        print(f"🎉 SUCCESS! Contract Deployed at: {contract_address}")
    except Exception as e:
        print(f"ERROR during deployment: {e}")
        sys.exit(1)
    
    print("Step 5: Updating your .env file automatically...")
    with open(".env", "r") as f:
        lines = f.readlines()
        
    with open(".env", "w") as f:
        for line in lines:
            if line.startswith("CONTRACT_ADDRESS="):
                f.write(f"CONTRACT_ADDRESS={contract_address}\n")
            else:
                f.write(line)
    
    print("ALL DONE! You can now start your server using 'python server.py'.")

if __name__ == "__main__":
    deploy()
