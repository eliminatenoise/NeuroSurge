"""Start the game using the adjacent NeuroTranslate model."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir',type=Path,help='extracted NeuroTranslate folder containing joint_demo.py')
    parser.add_argument('--no-browser',action='store_true')
    parser.add_argument('--touch',action='store_true',help='open the eight-task touch-study checkpoint')
    args=parser.parse_args()
    root=Path(__file__).resolve().parent
    explicit=args.model_dir or os.environ.get('NEUROTRANSLATE_DIR')
    model=Path(explicit) if explicit else root.parent/'neurotranslate-0.0'
    main_file=model/'joint_demo.py'
    if not main_file.is_file():
        parser.error('Place the extracted neurotranslate-0.0 folder beside this game, or set NEUROTRANSLATE_DIR to that folder.')
    python=Path(os.environ.get('NEUROTRANSLATE_PYTHON',sys.executable))
    env=dict(os.environ,OPENBLAS_NUM_THREADS='1',OMP_NUM_THREADS='1',MKL_NUM_THREADS='1')
    if not python.is_file() or subprocess.run([python,'-c','import numpy,sys;sys.exit(sys.version_info<(3,10))'],
                                                env=env,stderr=subprocess.DEVNULL).returncode!=0:
        parser.error('Python 3.10+ and NumPy are required. Set NEUROTRANSLATE_PYTHON to that Python executable.')
    command=[str(python),'-B',str(main_file.resolve()),'--game',str(root)]
    if args.touch:
        command.append('--touch')
    if args.no_browser:
        command.append('--no-browser')
    os.execve(str(python),command,env)
if __name__=='__main__':
    main()
