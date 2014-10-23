var express = require('express'); //Express Web Server 
var busboy = require('connect-busboy'); //middleware for form/file upload
var path = require('path'); //used for file path
var fs = require('fs-extra'); //File System - for file manipulation
var parse = require('csv-parse');
var _ = require('underscore');

var app = express();
app.use(busboy());
app.use(express.static(path.join(__dirname, 'public')));


var ynabFileName = null;
var bankFileName = null;
/* ========================================================== 
Create a Route (/upload) to handle the Form submission 
(handle POST requests to /upload)
Express v4  Route definition
============================================================ */
app.route('/upload').post(function(req, res, next) {

    res.redirect('/doYourThing'); //where to go next    
    /*
        var filesCount = 0;
        var fstream;
        req.pipe(req.busboy);
        req.busboy.on('file', function(fieldname, file, filename) {
            console.log("Uploading " + fieldname + ": " + filename);

            if (fieldname == 'ynabFile')
                ynabFileName = filename;

            if (fieldname == 'bankFile')
                bankFileName = filename;

            //Path where image will be uploaded
            fstream = fs.createWriteStream(__dirname + '/uploads/' + filename);
            file.pipe(fstream);
            fstream.on('close', function() {
                console.log("Upload Finished of " + filename);

                filesCount++;
                if (filesCount == 2)
                    res.redirect('/doYourThing'); //where to go next
            });
        });
    */
});


/// Show files
app.get('/doYourThing', function(req, res) {
    //    var ynabContent = fs.readFileSync(__dirname + "/uploads/" + ynabFileName);
    //    var bankContent = fs.readFileSync(__dirname + "/uploads/" + bankFileName);
    var ynabContent = fs.readFileSync(__dirname + "/tests/" + '0_ynab_same.csv');
    var bankContent = fs.readFileSync(__dirname + "/tests/" + '0_bank_same.csv');

    doYourThing(ynabContent, bankContent);
});



var server = app.listen(8080, function() {
    console.log('Listening on port %d', server.address().port);
});


function doYourThing(ynabContent, bankContent) {

    step_parseYnab(ynabContent, bankContent);
}

function step_parseYnab(ynabContent, bankContent, next) {
    parse(ynabContent.toString(), {
        delimiter: '\t'
    }, function(err, output) {
        var ynabParsed = output.slice(1, output.length); // remove header

        step_parseBank(ynabParsed, bankContent);
    });
}

function step_parseBank(ynabParsed, bankContent) {
    parse(bankContent.toString(), {
        delimiter: ','
    }, function(err, output) {
        var bankParsed = output.slice(1, output.length); // remove header
        bankParsed.pop(); // remove summary

        removeUnwantedBankLines(bankParsed);

        step_calcInserts(ynabParsed, bankParsed);
    });
}

function removeUnwantedBankLines(bankParsed) {
    var i = 0;
    var length = bankParsed.length;

    for (; i < length; i++) {
        var element = bankParsed[i];
        var description = element[2];
        if (description == 'Saldo Anterior') {
            bankParsed.splice(i, 1); //remove element
            i = -1;
            length--;
        }

        if (description.substring(0, 10) == 'Renda Fixa') {
            bankParsed.splice(i, 1); //remove element
            i = -1;
            length--;
        }
    }
}

function step_calcInserts(ynabParsed, bankParsed) {

    var insertList = [];
    _.each(bankParsed, function(bankLine) {
        var isMissing = isBankLineMissing(bankLine, ynabParsed);

        if (isMissing) {
            var data = getBankLineData(bankLine);
            insertList.push(data);
        }
    });

    step_calcRemovals(ynabParsed, bankParsed, insertList);
}


function isBankLineMissing(bankLine, ynabParsed) {

    _.each(ynabParsed, function(ynabLine) {
        var isEqual = compareLines(bankLine, ynabLine);

        if (isEqual)
            return false;
    });

    return true;
}

function isYnabLineMissing(ynabLine, bankParsed) {

    _.each(bankParsed, function(bankLine) {
        var isEqual = compareLines(bankLine, ynabLine);

        if (isEqual)
            return false;
    });

    return true;
}


function compareLines(bankLine, ynabLine) {
    var bankData = getBankLineData(bankLine);
    var ynabData = getYnabLineData(ynabLine);

    log('compareLines', 'compareLines', (JSON.stringify(bankData) + "\n\n\n" + JSON.stringify(ynabData)));


    if (bankData.dia == ynabData.dia &&
        bankData.mes == ynabData.mes &&
        bankData.ano == ynabData.ano &&
        bankData.valor == ynabData.valor)
        return true;

    return false;
}

// return {dia, mes, ano, data, valor, info}
function getBankLineData(line) {
    var result = {};

    result.dia = line[0].substring(3, 5); // 30 from 09/30/2014 
    result.mes = line[0].substring(0, 2); // 09 from 09/30/2014
    result.ano = line[0].substring(6, 10); // 2014 from 09/30/2014
    result.data = result.dia + "/" + result.mes + "/" + result.ano;
    result.info = line[2];

    result.valor = line[5];
    result.valor = parseFloat(result.valor); // -398.81 as float

    return result;
}

// return {dia, mes, ano, data, valor, info}
function getYnabLineData(line) {
    var result = {};


    result.dia = line[3].substring(0, 2); // 30 from 30/09/2014 
    result.mes = line[3].substring(3, 5); // 30 from 30/09/2014 
    result.ano = line[3].substring(6, 10); // 30 from 30/09/2014 
    result.data = result.dia + "/" + result.mes + "/" + result.ano;
    result.info = line[8]; // MEMO column

    // OUTFLOW
    if (line[8] != "R$0,00")
        result.valor = '-' + line[9].slice(2, 0); // R$249,90 into -249,90

    // INFLOW
    if (line[9] != "R$0,00")
        result.valor = line[10].slice(2, 0); // R$249,90 into 249,90    

    result.valor = result.valor.replace(',', '.'); // 249,90 into 249.90
    result.valor = parseFloat(result.valor); // 249.90 as float



    log('getYnabLineData', 'getYnabLineData', (line + "\n\n\n" + JSON.stringify(result)));



    return result;
}

function step_calcRemovals(ynabParsed, bankParsed, insertList) {

    var removalList = [];
    _.each(ynabParsed, function(ynabLine) {
        var isMissing = isYnabLineMissing(ynabLine, bankParsed);

        if (isMissing) {
            var data = getYnabLineData(ynabLine);
            removalList.push(data);
        }
    });

    step_generateResultContent(insertList, removalList);
}

function step_generateResultContent(insertList, removalList) {

    log('step_generateResultContent', 'insertList', insertList);
    log('step_generateResultContent', 'removalList', removalList);



    var content = "Date,Payee,Category,Memo,Outflow,Inflow\n";

    _.each(insertList, function(line) {
        if (line.valor > 0)
            content += line.data + ",DIFF,,ADD - " + line.info + ",," + line.valor + "\n";
        else
            content += line.data + ",DIFF,,ADD - " + line.info + "," + Math.abs(line.valor) + ",\n";
    });

    _.each(removalList, function(line) {
        if (line.valor > 0)
            content += line.data + ",DIFF,,REMOVE - " + line.info + ",," + line.valor + "\n";
        else
            content += line.data + ",DIFF,,REMOVE - " + line.info + "," + Math.abs(line.valor) + ",\n";
    });

    step_generateResultFile(content);
}

function step_generateResultFile(content) {

    log('step_generateResultFile', 'content', content);

    var file = '/uploads/result.csv';

    fs.outputFileSync(file, content, function(err) {
        console.log(err); //null


        fs.readFileSync(file, 'utf8', function(err, savedFile) {

            // RESPONSE
            res.writeHead(200, {
                'Content-Type': 'text/csv'
            });
            res.end(savedFile, 'binary');
        });
    });
}


function log(method, name, value) {
    console.log('');
    console.log('');
    console.log('------------------------------------------');
    console.log(method + ' - ' + name);
    console.log(value);
}