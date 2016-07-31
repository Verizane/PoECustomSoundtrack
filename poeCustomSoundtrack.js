const {ipcMain} = require('electron');
const defaults = require('./defaults.js')
const _ = require('lodash');
const fs = require('fs');
const fileTail = require('file-tail');

const DEFAULT_POE_PATH = "C:\\Program Files\\Grinding Gear Games\\Path of Exile\\"
//load settings from disk
const ElectronSettings = require('electron-settings');
let settings = new ElectronSettings({configDirPath: "./", configFilename: "settings"});

let mainWindow;
let currentTrackName = false;
let ft;

let worldAreas = defaults.worldAreas
let trackList = defaults.trackList
let soundtrack = defaults.soundtrack


let getTrackname = function(areaName){
  return areaMap[areaName] ? areaMap[areaName] : false;
}

let getTrackId = function(location){
  id = false
  type = getTrackType(location)
  if(type == 'youtube' && location.match(/\?v=(.{11})/)){
    id = location.match(/\?v=(.{11})/)[1]
  }
  else if(type == 'local'){
    id = location
  }
  return id
}

let getDurationInSeconds = function(length){
  parts = length.split(":")
  if(parts.length == 3)
    return parseInt(parts[0]) * 60*60 + parseInt(parts[1]) * 60 + parseInt(parts[2])
  else if(parts.length == 2)
    return parseInt(parts[0]) * 60 + parseInt(parts[1])
  else
    return parseInt(parts[0])
}

let getLogFile = function(poePath){
  return poePath + "\\logs\\Client.txt"
}

let getTrackType = function(location){
  if(location.match(/http/) && location.match(/youtu/)){
    return 'youtube'
  }
  else if(location.match(/http/) && location.match(/soundcloud/)){
    return 'soundcloud'
  }
  
  return 'local'
}

let generateTrack = function(track){
  var type = getTrackType(track.location)
  var id = getTrackId(track.location)
  return {type: type, id:id, name:track.name, duration:getDurationInSeconds(track.length)}
}

let randomElement = function(arr){
  return arr ? arr[Math.floor(Math.random()*arr.length)] : false;
}

let getTrack = function(areaCode){
  //How to find a track
  //Get area_code from log
  //Look up area_name from worldAreas[area_code]
  //Look up track_name from soundtrack[area_name]
  //Look up track from _.where(trackList, {name: track_name})
  track = false
  areaName = worldAreas[areaCode]
  trackName = soundtrack[areaName]
  //if track name is random, choose a random track from the entire track list
  //Otherwise filter the list of tracks by matching names and then randomly choose one that matches
  trackData = trackName == "random" ? randomElement(trackList) : randomElement(_.filter(trackList, {'name':trackName}))
  if(trackData){
    track = generateTrack(trackData)
  }
  return track
}


let parseLogLine = function(line) {
  var newArea = line.match(/Entering area (.*)/)
  if(newArea){
    //console.log(line)
    var areaCode = newArea[1]
    track = getTrack(areaCode)
    if(track){
      if(currentTrackName != track.name){
        currentTrackName = track.name
        mainWindow.webContents.send('changeTrack' , track);
      }
    }
    else{
      console.log(areaCode, " not mapped to a track")
    }
  }
}

let startWatchingLog = function(){
  //if we're already watching a file, lets stop before watching a new file
  if(ft && ft.stop){
    ft.stop()
  }

  ft = fileTail.startTailing(getLogFile(settings.get('poePath')));
  ft.on('line', parseLogLine);
 }

let doesFileExist = function(file){
  try{
    handle = fs.openSync(file, 'r+');
    fs.closeSync(handle)
  } catch (err) {
    return false
  }
  return true
}

let debugLog = function(line){
  try{
    handle = fs.openSync("debug.log", 'a');
    fs.writeFileSync(file,line)
    fs.closeSync(handle)
    return true
  } catch (err) {
    return false
  }

}

let writeFile = function(file, data)
{
  try{
    handle = fs.openSync(file, 'w');
    fs.writeFileSync(file,data)
    fs.closeSync(handle)
    return true
  } catch (err) {
    return false
  }
}

let readJsonFile = function(file)
{
  try{
    handle = fs.openSync(file, 'r+');
    var data = fs.readFileSync(file, "utf-8")
    fs.closeSync(handle)
    data = data.replace(/\\+/g, "/")
    return JSON.parse(data)
  } catch (err) {
    console.log("Error reading ", file)
    console.log(err)
    return false
  }
}

let doesLogExist = function(){
  var file = getLogFile(settings.get('poePath'))
  return doesFileExist(file)  
}


let checkMusicVolume = function (){
  var home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
  var configFile = home + "\\Documents\\My Games\\Path of Exile\\production_Config.ini"
  try{
    handle = fs.openSync(configFile, 'r+');
    var data = fs.readFileSync(configFile, "utf-8")
    fs.closeSync(handle)
    if(data.match(/music_volume[2]\=(\d+)/ig)){
      return parseInt(data.match(/music_volume[2]\=(\d+)/)[1])
    }
  } catch (err) {
  }
  return false
}

let setDefaults = function(){
  
  //make sure world areas, default trackList and default soundtrack are on disk
  if(!doesFileExist('WorldAreas.json')){
    writeFile('WorldAreas.json', JSON.stringify(defaults.worldAreas, null, "\t"))
  }

  if(!doesFileExist('TrackList.json')){
    writeFile('TrackList.json', JSON.stringify(defaults.trackList, null, "\t"))
  }

  if(!doesFileExist('diablo2.soundtrack')){
    writeFile('diablo2.soundtrack', JSON.stringify(defaults.soundtrack, null, "\t"))
  }

  //define poePath in settings if not set
  if(!settings.get('poePath')){
    settings.set('poePath', DEFAULT_POE_PATH)
  }

  //define selected soundtrack if not set
  if(!settings.get('soundtrack')){
    settings.set('soundtrack', "diablo2.soundtrack")
  }  

}

let loadTrackList = function(){
  trackList = readJsonFile('TrackList.json')
  if(!trackList){
    trackList = defaults.trackList
    return false
  }
  return true
}

let loadSoundtrack = function(){
  var soundtrackFile = settings.get('soundtrack')
  soundtrack = readJsonFile(soundtrackFile)
  if(!soundtrack){
    soundtrack = defaults.soundtrack
    return false
  }
  return true  
}

let run = function(browserWindow){
  mainWindow = browserWindow;

  setDefaults()

  loadTrackList()
  
  loadSoundtrack()

  startWatchingLog()

  ipcMain.on('setPoePath', function(event, arg){
    if(arg && arg[0]){
      settings.set('poePath', arg[0])
      if(doesLogExist()){
        startWatchingLog()
      }
      event.sender.send('updateState', {path:settings.get('poePath'),valid:doesLogExist(), volume:checkMusicVolume()});
    }
  });

  ipcMain.on('updateState', function(event, arg){
     event.sender.send('updateState', {path:settings.get('poePath'),valid:doesLogExist(), volume:checkMusicVolume()});
  })
}

module.exports = {
    run: run
}