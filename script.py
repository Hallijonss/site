import csv

import sys

csv.field_size_limit(10000000)

input_file = 'title.akas.tsv'
output_file = 'title_origin.tsv'

original_titles = {}
title_origins = {}

with open(input_file, encoding='utf-8') as f:
    reader = csv.DictReader(f, delimiter='\t')
    for row in reader:
        tid = row['titleId']
        title = row['title']
        region = row['region']
        is_original = row['isOriginalTitle'] == '1'

        if is_original:
            original_titles[tid] = title

        elif tid in original_titles and row['title'] == original_titles[tid] and region != r'\N':
            if tid not in title_origins:
                title_origins[tid] = region  # First match only

with open(output_file, 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f, delimiter='\t')
    writer.writerow(['titleId', 'region'])
    for tid, region in title_origins.items():
        writer.writerow([tid, region])
