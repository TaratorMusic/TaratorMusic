if ! command -v python3 &> /dev/null
then
    echo "Python is not installed. Installing Python..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        brew install python
    else
        # Linux
        sudo apt update
        sudo apt install -y python3 python3-pip
    fi
else
    echo "Python is already installed."
fi

python3 --version

if ! command -v pip3 &> /dev/null
then
    echo "Installing PIP..."
    curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py
    python3 get-pip.py
    rm get-pip.py
else
    echo "PIP is already installed."
fi

pip3 --version

echo "Installing Requests and Pytube..."
pip3 install requests
pip3 install pytubefix

echo "Installation complete."
