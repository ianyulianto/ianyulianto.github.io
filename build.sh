#!/bin/bash

set -e

WORKDIR=hugo
rm -rf docs

cd $WORKDIR
hugo

cd ..
cp -r $WORKDIR/public docs
