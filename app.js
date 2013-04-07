/**
 * 更新manifest文件的缓存文件版本号，同时关联更新相关文件中被引用的缓存文件版本号
 * 缓存文件的文件名在不同目录下不能相同
 * 所有输出文件编码为utf-8
 */

var util = require('util'),
    cwd = process.cwd(),
    fs = require('fs'),
    path = require('path'),
    //需匹配的文件
    fileFilter = /\.(html|css|js)$/;

var StringDecoder = require('string_decoder').StringDecoder, decoder = new StringDecoder('utf8');

var resFiles = {}, resFilesFullFilePath = {}, reCheckFile = [];

//获取版本号
var getRecVersion = (function(){
    var versionRegExp = /\?v=(\d+)/;
    return function(str){
        return versionRegExp.test(str) ? RegExp.$1 : '';
    }
})();

//about find  manifest
var manifestFilter = /\.manifest$/, manifestArr = fs.readdirSync(cwd), temp_file,
    manifest, manifestData, needUpdate;

//寻找manifest文件，在确定资源文件后，放到resFiles内
for(var i in manifestArr){
    temp_file = manifestArr[i];
    if(manifestFilter.test(temp_file)){ //获取第一个manifest文件
        manifest = temp_file;
        manifestData = fs.readFileSync(manifest, 'utf8');
        var recources = manifestData.match(/(.+)/g), isFileFilter = /\.[^\.]+$/;

        if(recources && recources.length){
            for(var x in recources){
                var str = recources[x];
                if(str == 'NETWORK:' || str == 'FALLBACK:'){ break; }
                else if(isFileFilter.test(str)){ //如果是匹配文件
                    var filePath = str.replace(/\?v=[0-9A-Za-z]+/g, ''), fullFilePath = cwd + '/' + filePath, mtime = getRecVersion(str) || '0';
                    resFiles[path.basename(filePath)] = mtime; //放到resFiles内
                    resFilesFullFilePath[path.basename(filePath)] = fullFilePath;
                    if(mtime !== getRecVersion(str)){ //版本号不一致
                        needUpdate = true;
                    }
                }
            }
        }
        break;
    }
}

manifestFilter = null;
manifestArr = null;
temp_file = null;
//about find manifest end

if(!needUpdate){
    console.log('don\'t need update');
    return false;
}

//about update resources
var recourcesRegExpArr = [], recourcesRegExp;
for(var i in resFiles){ recourcesRegExpArr.push(i.replace(/\./g, '\\.')); }

if(recourcesRegExpArr.length){
    recourcesRegExp = new RegExp('[(\'"][A-Za-z0-9/\._-]*(' + recourcesRegExpArr.join('|') + ')(?:\\?v=[0-9A-Za-z]+)?[)\'"]', 'g'); //匹配所有资源文件的正则
    recourcesRegExpArr = null;

    //查找含资源文件的文件，并替换资源文件URL
    var fileArr = [], hasRecFileArr = [], writeFileArr = [];

    function getMatchFiles(dir){
        var dir = dir || cwd, fileList = fs.readdirSync(dir);

        fileList.forEach(function(filename){
            var filePath = dir + '/' + filename, stats = fs.statSync(filePath);
            if(stats.isDirectory()){ //目录
                getMatchFiles(filePath);
            }else if(stats.isFile() && fileFilter.test(filename)){ //符合的文件
                fileArr.push(filePath);
            };
        });
    }

    function writeFile(callback){
        var hasWriteNum = 0, max = writeFileArr.length;
        writeFileArr.forEach(function(item){
            var filePath = item[0], data = item[1];
            fs.writeFile(filePath, data, function(){ //更新含资源文件的文件
                console.log('update file:' + filePath);
                if(++hasWriteNum === max){
                    callback();
                }
            });
        });
        writeFileArr = [];
    }

    function update(callback, finish){
        var max, arr, noHasRecFileArr = false, versionRegExp = /\?v=[0-9A-Za-z]+/g;
        if(hasRecFileArr.length){
            arr = hasRecFileArr;
        }else{
            arr = fileArr;
            fileArr = null;
            noHasRecFileArr = true;
        }
        max = arr.length;

        //TODO，不必每次都从硬盘读取文件
        var hasReadNum = 0;
        arr.forEach(function(filePath){
            fs.readFile(filePath, function(err, data){
                if(!err){
                    data = decoder.write(data);
                    if(recourcesRegExp.test(data)){
                        var hasUpdate = false;
                        data = data.replace(recourcesRegExp, function(matchStr, fileName){
                            if(resFiles[fileName] !== getRecVersion(matchStr)){
                                matchStr = matchStr.replace(versionRegExp, '').replace(new RegExp(fileName, 'g'), fileName + '?v=' + resFiles[fileName]); //更新缓存文件版本号
                                hasUpdate = true;
                            }
                            return matchStr;
                        });
                        noHasRecFileArr && hasRecFileArr.push(filePath);
                        hasUpdate && writeFileArr.push([filePath, data]);
                    }
                    ++hasReadNum === max && (writeFileArr.length ? writeFile(function(){ callback(), update(callback, finish); }) : finish());
                }else{
                    console.log('read ' + filePath + 'err');
                }
            });
        });
        arr = null;
    }

    //run
    getMatchFiles();
    update(function(){
        for(var x in resFiles){
            var mtime = fs.statSync(resFilesFullFilePath[x]).mtime;
            resFiles[x] = util.format('%d%d%d%d%d', mtime.getFullYear(), mtime.getMonth() + 1, mtime.getDate(), mtime.getHours(), mtime.getMinutes()); //映射cache文件和cache文件的修改日期
        }
    }, function(){
        for(var x in resFiles){
            //更新manifest里的相应缓存文件版本号
            manifestData = manifestData.replace(new RegExp(x + '(\\?v=[0-9A-Za-z]+)*', 'g'), x + '?v=' + resFiles[x]);
        }
        fs.writeFile(manifest, manifestData, function(){ console.log('finish') }); //更新整个manifest
        //console.log(manifestData);
    });
}
//about update resources end