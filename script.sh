#!/bin/bash
# A simple script to convert namespace project-4-namespace to simplemsgapp
for file in $(find . -type f -name '*.yaml'); do
    sed -i 's/app-1/firstapp/g' "$file"
done