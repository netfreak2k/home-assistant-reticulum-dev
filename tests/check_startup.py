import pathlib
import subprocess
import tempfile
root = pathlib.Path(__file__).resolve().parents[1]
source = (root/'reticulum_dev/rootfs/etc/services.d/reticulum/run').read_text()
with tempfile.TemporaryDirectory() as td:
    tmp = pathlib.Path(td)
    script = tmp/'run.sh'
    config_dir = tmp/'config'
    script.write_text(source.replace('/config/reticulum', str(config_dir)))
    shim = tmp/'shim.sh'
    shim.write_text('''
bashio::config(){
 case "$1" in
  auto_interface) echo false;; internet_bootstrap) echo true;;
  tcp_interface) echo true;; tcp_host) echo example.invalid;; tcp_port) echo 4242;;
  rnode_interface) echo true;; rnode_port) echo /dev/null;;
  rnode_frequency) echo 868100000;; rnode_bandwidth) echo 125000;;
  rnode_txpower) echo 14;; rnode_spreadingfactor) echo 10;; rnode_codingrate) echo 5;;
  transport) echo false;; loglevel) echo info;;
 esac
}
bashio::var.true(){ [[ "$1" == true || "$1" == Yes ]]; }
bashio::log.info(){ :; }
bashio::log.error(){ :; }
bashio::log.fatal(){ :; }
rnsd(){ return 0; }
''')
    for iteration in range(2):
        result = subprocess.run(['bash','-c', 'source "$1"; source "$2"', 'audit', str(shim), str(script)], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        config = (config_dir/'config').read_text()
        assert config.count('[[Home Assistant RNode]]') == 1
        assert config.count('[[Home Assistant TCP Client]]') == 1
        assert 'frequency = 868100000' in config
        assert 'discover_interfaces' not in config
        if iteration == 0:
            with (config_dir/'config').open('a') as f:
                f.write('\n  [[User TCP]]\n    type = TCPClientInterface\n    enabled = Yes\n    target_host = user.invalid\n    target_port = 4242\n')
        else:
            assert '[[User TCP]]' in config
    print('startup config / repeat restart / managed block uniqueness / manual interface preservation: PASS')
