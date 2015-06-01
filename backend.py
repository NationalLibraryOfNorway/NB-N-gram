#!/usr/bin/python
# -*- coding: utf8 -*-

# National Library of Norway, 2014-2015

# load the packages
from pysqlite2 import dbapi2 as sqlite3
from collections import Counter
from operator import itemgetter
from itertools import chain
from flask import Flask, Response, request, session, g, redirect, url_for, \
     abort, render_template, flash, jsonify
from contextlib import closing
import re
import json
import sys
import operator
import itertools

## CONFIGURATION
# path to databases
try:
    path = str(sys.argv[1])
except:
    path = ''

# specify port (default: 5000)
try:
    port = int(sys.argv[2])
except:
    port = 5000

# specify host (default: 127.0.0.1)
try:
    host = str(sys.argv[3])
except:
    host = '127.0.0.1'

# paths for the databases
UNIGRAM = path + 'unigram-one-row.db'
BIGRAM = path + 'bigram-one-row.db'
TRIGRAM = path + 'trigram-one-row.db'
AVIS_UNIGRAM = path + 'avis-unigram-one-row.db'
AVIS_BIGRAM = path + 'avis-bigram-one-row.db'
AVIS_TRIGRAM = path + 'avis-trigram-one-row.db'

# database structure
db_names = {'bok': 'bok_', 'avis': 'avis_'}
table_names = ['unigram', 'bigram', 'trigram']
index_names = {'bok': ['_lff_','_lfsf_','_lfstf_'], 'avis': ['_ff_','_fsf_','_fstf_']}
field_names = ['first', 'second', 'third']

# Allowed paramaters
languages = 'all|nob|nno'
corpora = 'bok|avis'

# Default paramaters
default_params = {'terms': '', 'lang': 'all', 'case_sens': '0', 'freq': 'rel', 'corpus': 'bok'};

# Maximum values
maxTerms = 10
maxNgram = 3 # currently, only unigram, bigram, trigram is supported
maxChar = 200 # cut-off-point at 200 characters for query string
maxWildcards = 5
maxAdd = 10
maxTrunct = 5

# loads a JSON object holding the max. frequencies per year for calculation of relative frequency in python (optional: you might want to store these in the database itself)
with open ('totals.json', 'r') as f:
    freqs_per_year = json.load(f)

# initiating Flask (with settings from environment variable - for use in development and production environments)
app = Flask(__name__, static_url_path='/ngram/static')
app.config.from_object(__name__)
app.config.from_envvar('FLASK_NGRAM_SETTINGS')

# connection to DB
def connect_db(self):
    rv = sqlite3.connect(self)
    #rv.row_factory = sqlite3.Row
    return rv

@app.before_request
def before_request():
    """ establish connection upon request """
    g.db = connect_db(UNIGRAM)
    
    # Attach databases
    g.db.execute("ATTACH DATABASE '" + UNIGRAM + "' as bok_unigram;")
    g.db.execute("ATTACH DATABASE '" + BIGRAM + "' as bok_bigram;")
    g.db.execute("ATTACH DATABASE '" + TRIGRAM + "' as bok_trigram;")
    g.db.execute("ATTACH DATABASE '" + AVIS_UNIGRAM + "' as avis_unigram;")
    g.db.execute("ATTACH DATABASE '" + AVIS_BIGRAM + "' as avis_bigram")
    g.db.execute("ATTACH DATABASE '" + AVIS_TRIGRAM + "' as avis_trigram")

@app.after_request
def after_request(response):
    """ Close connection after request """
    
    g.db.close()
    return response

def query_db_dict(query, args=(), one=False):
    """ Return results as dictionary """
    
    cur = g.db.execute(query, args)
    rv = [dict((cur.description[idx][0], value)
               for idx, value in enumerate(row)) for row in cur.fetchall()]
    return (rv[0] if rv else None) if one else rv

def query_db_row(query, args=(), one=False):
    """ Return results as rows """
    
    cur = g.db.execute(query, args)
    rv = [list((value)
                for idx, value in enumerate(row)) for row in cur.fetchall()]
    return (rv[0] if rv else None) if one else rv

def return_terms(terms):
    """Gets a string of terms and returns them as a list, with some clean-up"""
    
    # index for wildcards (not allowed to exceed maxWildcards, these ones are powerful)
    wildcardIdx = 0
    # we only allow a certain amount of characters in the terms string
    terms = terms[:maxChar]
    # removes unnecessary whitespace or empty query terms
    terms = re.sub(r',\s{0,},',',', terms)
    # splits on comma (with following whitespace): commas may be masked by quoatation marks
    terms = re.findall('[^\,\"]+|\"[^"]*\"', terms)
    # gets number of terms
    nTerms = len(terms)
    # checks if number exceeds maxTerms, remaining ones are removed
    if nTerms >= maxTerms:
        terms = terms[:maxTerms]
        nTerms = maxTerms
    # loops through each term
    for i in range(nTerms):
        # substitutes '*' with '%' for SQL queries, removes illegal wildcards (according to maxWildcards)
        if "*" in terms[i] and wildcardIdx < maxWildcards:
            wildcardIdx += 1
            terms[i] = terms[i].replace("*", "%")
        else:
            terms[i] = terms[i].replace("*", "")
        # removes whitespace at the beginning or the end of the string
        terms[i] = re.sub(r'^\s+', '', terms[i])
        terms[i] = re.sub(r'\s+$', '', terms[i])
        # removes mask for comma
        if terms[i] == '","':
            terms[i] = re.sub(r'","',',', terms[i])
        # removes whitespace between '+' and terms
        if "+" in terms[i]:
            terms[i] = re.sub(r'\s+\+', '+', terms[i])
            terms[i] = re.sub(r'\+\s+', '+', terms[i])
    
    return terms

def query_factory(ngrams, lang, case_sens, corpus):
    """ Creates a sql query for each item in the object """
    
    sql_array = []
    args_array = []
    label_array = []
    lang_array = []
    corpus_array = []

    for ngram in ngrams:
        sql, args, query_lang, query_corpus = build_query_single(ngram, lang, case_sens, corpus)
        sql_array.append(sql)
        args_array.append(args)
        label_array.append(' '.join(ngram))
        lang_array.append(query_lang)
        corpus_array.append(query_corpus)

    return sql_array, args_array, label_array, lang_array, corpus_array

def extract_info(term):
    """ Extracts information after colon, returns only ngram and dictionary of arguments"""
    
    ngram = []
    argumentDict = {}
    lastElement = len(term) - 1
    splitted = term[lastElement].split(':')

    if len(splitted) >= 2:
        ngram.extend(term[:lastElement])
        ngram.extend([splitted[0]])

        extension = splitted[1:]

        for element in extension:
            if re.match(r'nob|nno|all', element):
                argumentDict['lang'] = element
            if re.match(r'bok|avis', element):
                argumentDict["db"]  = element
                if re.match (r'avis', element):
                    argumentDict["lang"]  = 'all'
                if re.match (r'bok', element) and re.match(r'nob|nno|all', element) != -1:
                    argumentDict["lang"]  = 'all'
            if re.match(r'[0-9]{4}', element):
                argumentDict["anno"]  = element

        return ngram, argumentDict

def wildcard_search(ngrams, lang, case_sens, corpus):
    """ Returns the ten most common ngrams matching query """
    
    whereClause = []
    whereParams = []
    args = []
    ngramSize = len(ngrams)
    argumentDict = {"ngram": [], "lang": lang, "db": corpus}

    if extract_info(ngrams) != None:
        ngrams, argumentsExtracted = extract_info(ngrams)
        argumentDict = dict_merge(argumentDict, argumentsExtracted)

    # values based on input
    params = 'in (?,?)' if case_sens == '0' else 'in (?)'
    langClause = 'and lang = ?' if argumentDict["lang"] != "all" else ''
    getFieldNames = ', '.join(field_names[:ngramSize])
    getTableNames = db_names[argumentDict["db"]] + table_names[ngramSize-1] + "." + table_names[ngramSize-1]

    for ngram in ngrams:
        if "%" in ngram:
            argumentDict["ngram"].append(ngram)
            whereParams.append("LIKE ?")
        else:
            whereParams.append(params)
            if case_sens == '0':
                argumentDict["ngram"].extend(swapcase([ngram]))
            else:
                argumentDict["ngram"].append(ngram)

    idxName = query_planner(whereParams,argumentDict["ngram"])

    whereClause = " and ".join( list(('(%s %s)' % (field_names[idx],whereParams[idx]))
                    for idx, val in enumerate(ngrams)) ) + (langClause if argumentDict["db"] == 'bok' else '') 

    sql = "SELECT DISTINCT %s FROM (SELECT %s, freq FROM %s INDEXED BY %s WHERE %s ORDER BY freq DESC LIMIT 10) T;" % (getFieldNames, getFieldNames, getTableNames, idxName, whereClause)

    # builds argument array for SQL query
    args.extend(argumentDict["ngram"])
    args.append(argumentDict["anno"]) if "anno" in argumentDict else None

    if argumentDict["lang"] != 'all' and argumentDict["db"] == 'bok':
        args.append(argumentDict["lang"])

    cur = g.db.execute(sql, args)
    return ([list((value)
            for idx, value in enumerate(row)) for row in cur.fetchall()], argumentDict["lang"], argumentDict["db"])

def query_planner(where,args):
    """ NB N-gram query planner """
    letters = ['f','s','t']
    letterCombination = ''

    for idx,val in enumerate(where):
        if '=' in where[idx]:
            letterCombination += letters[idx]
        elif 'LIKE' in where[idx] and len(args[idx]) > 1:
            letterCombination = ''.join(letters[:len(where)])
            return '_' + letterCombination + 'f_'
    return '_' + letterCombination + 'f_'

def extract_values(dictionary):
    values = []

    for key, value in sorted(dictionary.items()):
        values.extend(value)
    return values

def combination_gen(ngrams):
    """ Returns combinations for truncated expressions """
    
    args = []

    if len(ngrams) > 1:
        for item1 in ngrams[0]:
            for item2 in ngrams[1]:
                if len(ngrams) == 2:
                    args.append([item1, item2])
                if len(ngrams) == 3:
                    for item3 in ngrams[2]:
                        args.append([item1, item2, item3])
    else:
        for item in ngrams[0]:
            args.append([item])

    return args

def dict_merge(a, b):
  c = a.copy()
  c.update(b)
  return c

def build_query_single(ngram, lang, case_sens, corpus):
    args = []

    argumentDict = {"ngram": [], "lang": lang, "db": corpus}
    ngramSize = len(ngram)

    # get values after colon, parse them
    if extract_info(ngram) != None:
        ngram, argumentsExtracted = extract_info(ngram)
        argumentDict = dict_merge(argumentDict, argumentsExtracted)

    # values based on input
    params = 'in (?,?)' if case_sens == '0' else 'in (?)'
    langClause = ' and lang = ?' if argumentDict["lang"] != 'all' else " and lang in (?,?)"
    whereClause = " and ".join( list(('(%s %s)' % (field_names[idx], params))
                    for idx, val in enumerate(ngram)) ) + (langClause if argumentDict["db"] == 'bok' else '')
    getTableName = db_names[argumentDict["db"]] + table_names[ngramSize-1] + "." + table_names[ngramSize-1]

    # "Case-insensitive": because of limits of our current sqlite3 implementation, we only allow for a quasi case-insensitive search (only the first letter of a word is considered)
    if case_sens == '0':
        argumentDict["ngram"] = swapcase(ngram)
    else:
        argumentDict["ngram"] = ngram
        
    idxName = index_names[argumentDict["db"]][ngramSize-1]

    # Builds query string
    sql = "SELECT json FROM %s INDEXED BY %s WHERE %s" % (getTableName, idxName, whereClause)

    # Builds argument array
    args.extend(argumentDict["ngram"])
    args.append(argumentDict["anno"]) if "anno" in argumentDict else None

    if argumentDict["lang"] != 'all' and argumentDict["db"] == 'bok':
        args.append(argumentDict["lang"])
    elif argumentDict["lang"] == 'all' and argumentDict["db"] == 'bok':
        args.append('nob')
        args.append('nno')

    return (sql, args, argumentDict["lang"], argumentDict["db"])

def swapcase(args):
    """ Swaps the case of the first letter of the argument """
    
    lowerUpperArgs = []
    try:
        for arg in args:
            lowerUpperArgs += arg, arg[0].swapcase() + arg[1:]
    except:
        return None
    return lowerUpperArgs

def tokenize(term):
    """ Very simple tokenizer: based on whitespace but not including paranthesis """
    return re.findall('[^\s\(]+|\([^)]*\)', term)

def termParser(i, lParams):
    ngrams = []
    term = lParams['terms'][i]
    
    if "+" in term:
        qType = 'agg'
        # splits on +, up to value of maxAdd
        aggNgrams = re.split('\+', term, maxAdd)[:maxAdd]
        
        for item in aggNgrams:
            aggNgram = tokenize(item)
            if len(aggNgram) > maxNgram:
                ngrams += [aggNgram[:maxNgram]]
            else:
                ngrams += [aggNgram]
    else:
        # invokes the tokenizer
        ngrams = tokenize(term)
        # only unigram to trigram search is allowed for
        if len(ngrams) > maxNgram:
            ngrams = ngrams[:maxNgram]
    
        if any("%" in ngram for ngram in ngrams):
            qType = 'wildcard'
            # returns ngrams for wildcard
            ngrams, lParams['lang'], lParams['corpus'] = wildcard_search(ngrams, lParams['lang'], lParams['case_sens'], lParams['corpus'])

            # hack: as for now, case_sens must be 1 when doing wildcard_search
            lParams['case_sens'] = '1'
        else:
            # checks if the term contains brackets, if, then return the combinations
            # regular expression for finding brackets
            parentes = re.compile('\([^)]*\)')
            if any(parentes.match(ngram) for ngram in ngrams):
                qType = 'trunctated'
                for i in range(len(ngrams)):
                    ngrams_or = ngrams[i].strip('()')
                    ngrams[i] = re.split("\s", ngrams_or, maxTrunct)[:maxTrunct]
                ngrams = combination_gen(ngrams)
            else:
                qType = 'single'
                ngrams = [ngrams]
            
    return (ngrams, qType, lParams)

def merge_result(self):
    """ Returns a merged object (similar to UNION SELECT) """
    
    total = Counter()
    jsonObject = {}

    # loops through each result row
    for entry in self:
        jsonObject = json.loads(entry[0])
        entryCounter = Counter(jsonObject)
        total += entryCounter

    return total

def get_relfreq(total,total_freq):
    """Calculates the relative frequency for each item, returns complete dictionary """
    relfreq_dict = []

    for attribute, value in total.iteritems():
        if int(attribute) >= 1810:
            rel_freq = float(value) / total_freq[attribute] * 100
            relfreq_dict.append({"x": int(attribute), "y": rel_freq, "f": int(value)})

    return relfreq_dict

def return_agg_results(sql,args,lang,label,corpus):
    """ Returns results for multiple items to be summed """
    
    entries = []
    result = []
    corplang_set = set()
    corpus_totalfreq = []
    total_freq = Counter()
    
    # Gets the result for each sub-query
    for idx, val in enumerate(sql):
        result += query_db_row(sql[idx], args[idx])

    # merges the result
    total = merge_result(result)

    ## finds out which corpora/languages were used in the query prior to calculating relative frequency
    corplang_pairs = [[a, b] for a, b in zip(corpus, lang)]
    corplang_set = set(map(tuple, corplang_pairs))
    for item in corplang_set:
        corpus_totalfreq.append([freqs_per_year[item[0]][item[1]]])

    ## calculates the grand total frequency
    for item in corpus_totalfreq:
        entry_counter = Counter(item[0])
        total_freq += entry_counter

    ## returns a sorted dictionary with relative frequencies
    relfreq_dict = get_relfreq(total,total_freq)
    relfreq_dict = sorted(relfreq_dict, key=itemgetter('x'))

    if relfreq_dict != []:
        entries += [{"key": label, "values": relfreq_dict}]
    
    return entries

def return_single_results(sql,args,lang,label,corpus):
    """ Returns the results for single items """
    
    entries = []
    total_freq = Counter()
    
    # Gets the result for each sub-query
    for idx, val in enumerate(sql):
        result = query_db_row(sql[idx], args[idx])
    
        total = merge_result(result)
        total_freq = freqs_per_year[corpus[idx]][lang[idx]]
    
        ## returns a sorted dictionary with relative frequencies
        relfreq_dict = get_relfreq(total,total_freq)
        relfreq_dict = sorted(relfreq_dict, key=itemgetter('x'))

        if relfreq_dict != []:
            entries += [{"key": label[idx], "values": relfreq_dict}]
    
    return entries

def get_query_params(request):
    """ Returns a dictionary of query parameters """
    
    qParams = {}
    # gets the query parameters, does some basic validation and builds a dictionary of paramaters
    terms = request.args.get('terms')
    if terms:
        qParams['terms'] = terms
    lang = request.args.get('lang')
    if lang:
        if re.match(languages, lang):
            qParams['lang'] = lang
    case_sens = request.args.get('case_sens')
    if case_sens:
        if re.match('0|1',case_sens):
            qParams['case_sens'] = case_sens
    freq = request.args.get('freq')
    if freq:
        if re.match('rel|abs',freq):
            qParams['freq'] = freq
    corpus = request.args.get('corpus')
    if corpus:
        if re.match(corpora,corpus):
            qParams['corpus'] = corpus
            
    return qParams

@app.route('/')
def index():
    return render_template('header-footer.html')

@app.route('/ngram/query')
def query():
    entries = []
    # get query paramaters
    qParams = get_query_params(request)
    # fills in default_parameters for those not set
    sParams = dict_merge(default_params, qParams)
    # does some clean-up and returns terms as list
    sParams['terms'] = return_terms(sParams['terms'])
    # gets total number of statements
    nTerms = len(sParams['terms'])
    # loops through each term, interpreting it and generating query
    for i in range(nTerms):
        # invokes term parser
        ngrams, qType, lParams = termParser(i, sParams)
        # starts the query factory for interprated term
        sql, args, label, lang, corpus = query_factory(ngrams, lParams['lang'], lParams['case_sens'], lParams['corpus'])
        # run query depending on amount of results from query_factory
        if len(sql) == 1:
            entries += return_single_results(sql,args,lang,label,corpus)
        elif len(sql) > 1:
            if qType == 'agg':
                entries += return_agg_results(sql, args, lang, label, corpus)
            elif qType == 'wildcard' or qType == 'trunctated':
                entries += return_single_results(sql,args,lang,label,corpus)
            else:
                pass
        else:
            pass

    jsonOutput = export_to_json(entries)
    return Response(jsonOutput, mimetype='application/json')

def export_to_json(entries):
    """ Exports results as a JSON object """
    return json.dumps(entries, indent=4, separators=(', ', ': '))

def export_to_json_file(entries):
    """ Exports result as JSON file """
    with open('static/dump.json', 'wb') as outfile:
        json.dump(entries, outfile, indent=4, separators=(', ', ': '))

if __name__ == '__main__':
    app.run(port=port,host=host)
